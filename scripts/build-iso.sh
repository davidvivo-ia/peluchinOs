#!/usr/bin/env bash
# Build a bootable peluchinOs Live ISO.
# Requires: mmdebstrap, squashfs-tools, xorriso, grub-pc-bin (and the
# debian-archive-keyring on non-Debian hosts).
# Produces: peluchinOs-live.iso in the current directory.
#
# Workflow:
#   1. mmdebstrap Debian Trixie (glibc 2.41, matches our Tauri build)
#      into ./chroot/ with the userspace we need: Linux kernel, live-boot,
#      Xorg, matchbox-wm (kiosk), webkit2gtk + GTK runtime, fonts.
#   2. Install ../src-tauri/target/release/bundle/deb/peluchinOs_*.deb
#      inside the chroot.
#   3. Create the peluchin user with passwordless sudo and configure
#      agetty@tty1 to autologin them.
#   4. .bash_profile on tty1 launches `startx`; .xinitrc launches
#      matchbox-window-manager (no titlebars) + /usr/bin/peluchinos so
#      the Tauri shell IS the whole UI.
#   5. mksquashfs the rootfs and grub-mkrescue an ISO 9660 hybrid image
#      bootable on BIOS, UEFI and from USB.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")"/.. && pwd)"
WORK="$ROOT/iso-build"

# Pick whatever .deb the Tauri bundler emitted, version-agnostic — the
# filename carries the version (peluchinOs_<ver>_amd64.deb) so hardcoding
# it means the ISO stops building the day the version bumps.
DEB="$(ls -1 "$ROOT"/src-tauri/target/release/bundle/deb/peluchinOs_*_amd64.deb 2>/dev/null | head -n1 || true)"

[ -n "$DEB" ] && [ -f "$DEB" ] || {
  echo "Build the Tauri .deb first: cd $ROOT && npm run tauri build"
  exit 1
}
echo ">>> using bundle: $DEB"

mkdir -p "$WORK"/{chroot,iso-root/live,iso-root/boot/grub}
cd "$WORK"

# 1. Bootstrap minimal Debian Trixie with our required userspace.
echo ">>> bootstrapping Debian trixie ..."
rm -rf chroot && mkdir chroot
mmdebstrap --variant=minbase \
  --keyring=/usr/share/keyrings/debian-archive-keyring.gpg \
  --include='linux-image-amd64,live-boot,systemd-sysv,dbus,kbd,sudo,
            apt,apt-utils,dpkg,ca-certificates,xserver-xorg-core,
            xserver-xorg-legacy,xserver-xorg-input-libinput,
            xserver-xorg-video-fbdev,xserver-xorg-video-vesa,
            xserver-xorg-video-qxl,xserver-xorg-video-vmware,
            xserver-xorg-video-modesetting,xinit,x11-xserver-utils,
            matchbox-window-manager,libgtk-3-0,libwebkit2gtk-4.1-0,
            libayatana-appindicator3-1,librsvg2-2,libssl3,
            fonts-dejavu-core,locales' \
  trixie chroot http://deb.debian.org/debian

# 2/3/4. Install peluchinOs, autologin, kiosk session.
echo ">>> configuring chroot ..."
cp "$DEB" chroot/tmp/peluchinos.deb
chroot chroot /bin/bash -e <<'EOF'
export DEBIAN_FRONTEND=noninteractive
echo peluchinos > /etc/hostname
echo "127.0.0.1 localhost peluchinos" > /etc/hosts

dpkg -i /tmp/peluchinos.deb || true
apt-get update >/dev/null
apt-get install -y -f >/dev/null
rm /tmp/peluchinos.deb

useradd -m -s /bin/bash -G sudo,audio,video,input peluchin
passwd -d peluchin
echo "peluchin ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/peluchin

mkdir -p /etc/systemd/system/getty@tty1.service.d
cat > /etc/systemd/system/getty@tty1.service.d/autologin.conf <<'CONF'
[Service]
ExecStart=
ExecStart=-/sbin/agetty --noissue --autologin peluchin --noclear %I $TERM
CONF

cat > /etc/X11/Xwrapper.config <<'CFG'
allowed_users=anybody
needs_root_rights=yes
CFG

cat > /home/peluchin/.bash_profile <<'BP'
case "$(tty)" in
  /dev/tty1)
    if [ -z "$DISPLAY" ]; then
      echo "[peluchinOs] starting X — this can take up to 30s on a cold VM..."
      startx > /tmp/startx.log 2>&1
      RC=$?
      echo
      echo "[peluchinOs] startx exited ($RC). Last 30 lines of /tmp/startx.log:"
      tail -30 /tmp/startx.log 2>/dev/null
      echo
      echo "Press Enter to retry, or Ctrl+Alt+F2 for a shell on tty2."
      read -r _ || true
      exec bash -l
    fi
    ;;
esac
BP

cat > /home/peluchin/.xinitrc <<'XR'
#!/bin/sh
# Don't blank or DPMS during a kiosk session.
xset s off -dpms s noblank 2>/dev/null
# Paint the teal wallpaper immediately so the 5-15 s webkit startup
# doesn't look like a frozen black screen.
xsetroot -solid '#008080' 2>/dev/null
matchbox-window-manager -use_titlebar no -use_cursor yes &
sleep 0.5
exec /usr/bin/peluchinos
XR
chmod +x /home/peluchin/.xinitrc
# Mask Ctrl+Alt+Del so systemd doesn't eat the BSOD easter-egg chord.
systemctl mask ctrl-alt-del.target >/dev/null 2>&1 || true
chown -R peluchin:peluchin /home/peluchin

# Don't suppress the OOM-killer info or any other useful kernel messages.
# We boot the default entry in NON-quiet mode by default so a stuck VM
# stays diagnosable.

echo "en_US.UTF-8 UTF-8" > /etc/locale.gen
locale-gen >/dev/null

cat > /etc/motd <<'MOTD'
peluchinOs live image (Debian trixie / Linux 6.12 + peluchinOs shell)
Auto-login as peluchin on tty1; Ctrl+Alt+F2..F6 for other ttys.

This is a real Debian userspace. To install Debian packages, drop to a
tty and use apt (needs network — NAT works out of the box in a VM):

    sudo apt-get update
    sudo apt-get install <package>

or install a local .deb with dpkg:

    sudo dpkg -i <package>.deb
MOTD

# Keep apt usable: drop the cached .debs (saves ISO space) but leave the
# sources.list in place so `apt-get update` works on first use.
apt-get clean
rm -rf /var/lib/apt/lists/* /var/cache/apt/archives/*.deb
EOF

# 5. Stage kernel + initrd, write GRUB config, squash, build ISO.
echo ">>> assembling ISO image ..."
cp chroot/boot/vmlinuz-* iso-root/boot/vmlinuz
cp chroot/boot/initrd.img-* iso-root/boot/initrd.img

cat > iso-root/boot/grub/grub.cfg <<'GRUB'
set timeout=30
set timeout_style=menu
set default=0

insmod all_video
insmod gfxterm
if loadfont unicode ; then
  terminal_output gfxterm
fi

set color_normal=light-gray/black
set color_highlight=black/cyan

echo ""
echo "   peluchinOs 1.0.0-fluffy - Debian trixie / Linux 6.12 - Live ISO"
echo "   Boot starts in 30 s. Use up/down + Enter to choose."
echo ""

menuentry "peluchinOs Live (universal - any GPU)" {
    linux /boot/vmlinuz boot=live components vga=788 console=tty1
    initrd /boot/initrd.img
}
menuentry "peluchinOs Live (KMS accelerated - VMSVGA/QEMU)" {
    linux /boot/vmlinuz boot=live components console=tty1
    initrd /boot/initrd.img
}
menuentry "peluchinOs Live (nomodeset fallback)" {
    linux /boot/vmlinuz boot=live components nomodeset vga=791 console=tty1
    initrd /boot/initrd.img
}
menuentry "peluchinOs Live (text console rescue)" {
    linux /boot/vmlinuz boot=live components 3 vga=normal
    initrd /boot/initrd.img
}
GRUB

mksquashfs chroot iso-root/live/filesystem.squashfs \
  -noappend -comp xz -e boot
grub-mkrescue -o peluchinOs-live.iso iso-root/

ls -lah peluchinOs-live.iso
echo ">>> done. Run with:  qemu-system-x86_64 -m 2G -cdrom $WORK/peluchinOs-live.iso"
