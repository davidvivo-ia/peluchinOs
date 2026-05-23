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
DEB="$ROOT/src-tauri/target/release/bundle/deb/peluchinOs_0.0.1_amd64.deb"

[ -f "$DEB" ] || {
  echo "Build the Tauri .deb first: cd $ROOT && npm run tauri build"
  exit 1
}

mkdir -p "$WORK"/{chroot,iso-root/live,iso-root/boot/grub}
cd "$WORK"

# 1. Bootstrap minimal Debian Trixie with our required userspace.
#    Note: --include MUST be a single-line, comma-separated list — line
#    continuations inside the single-quoted argument keep the indentation
#    spaces as part of the package name and apt then can't resolve them.
#    Note: live-boot-initramfs-tools is listed explicitly so the initrd
#    that linux-image-amd64 generates at install time contains the
#    /scripts/live/ hooks. Without that, the kernel boots fine but the
#    initrd doesn't know how to find /live/filesystem.squashfs and the
#    boot hangs with a blinking cursor (no kernel output, because the
#    panic happens before userspace sets up the console).
echo ">>> bootstrapping Debian trixie ..."
rm -rf chroot && mkdir chroot
mmdebstrap --variant=minbase \
  --include='linux-image-amd64,live-boot,live-boot-initramfs-tools,initramfs-tools,systemd-sysv,dbus,kbd,sudo,ca-certificates,xserver-xorg-core,xserver-xorg-legacy,xserver-xorg-input-libinput,xserver-xorg-video-fbdev,xserver-xorg-video-vesa,xserver-xorg-video-qxl,xserver-xorg-video-vmware,xserver-xorg-video-modesetting,xinit,matchbox-window-manager,libgtk-3-0,libwebkit2gtk-4.1-0,libayatana-appindicator3-1,librsvg2-2,libssl3,fonts-dejavu-core,locales' \
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

# Re-generate the initrd so it definitely includes live-boot's
# /scripts/live hooks. mmdebstrap installs packages in a single batch
# and the initrd built during linux-image's postinst can miss hooks
# from packages configured later. Without this, the kernel boots but
# the initrd never mounts /live/filesystem.squashfs and the VM hangs
# at a blinking cursor.
update-initramfs -u -k all

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
peluchinOs live image (Linux + peluchinOs shell)
Auto-login as peluchin on tty1; Ctrl+Alt+F2..F6 for other ttys.
MOTD

apt-get clean
rm -rf /var/lib/apt/lists/* /var/cache/apt/archives/*
EOF

# 5. Stage kernel + initrd, write GRUB config, squash, build ISO.
#    Pick the newest matching file deterministically — `cp vmlinuz-* dest`
#    silently fails as soon as more than one kernel is installed.
echo ">>> assembling ISO image ..."
VMLINUZ="$(ls -1 chroot/boot/vmlinuz-* | sort -V | tail -n1)"
INITRD="$(ls -1 chroot/boot/initrd.img-* | sort -V | tail -n1)"
[ -f "$VMLINUZ" ] || { echo "no kernel in chroot/boot"; exit 1; }
[ -f "$INITRD"  ] || { echo "no initrd in chroot/boot"; exit 1; }
cp "$VMLINUZ" iso-root/boot/vmlinuz
cp "$INITRD"  iso-root/boot/initrd.img

# grub.cfg: keep it strictly to commands GRUB understands. The previous
# version used a bash-style `cat <<'BANNER'` heredoc which GRUB parses
# as a series of unknown commands — visible as parser errors above the
# menu and, on some firmwares, a corrupted screen state. `echo` is the
# correct GRUB equivalent.
# `boot` is added explicitly at the end of each menuentry so the kernel
# is launched even if the implicit-boot behaviour is disabled.
# `console=tty0` forces output to the VGA console so we'd actually SEE
# kernel panics in VirtualBox if anything goes wrong from here.
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

echo "   peluchinOs 0.0.1-fluffy - Linux Live ISO"
echo "   ----------------------------------------"
echo "   Boot starts in 30 s. Use Up/Down + Enter."
echo ""

menuentry "peluchinOs Live (verbose boot, recommended for VirtualBox)" {
    echo "Loading kernel ..."
    linux /boot/vmlinuz boot=live components nomodeset console=tty0
    echo "Loading initramfs ..."
    initrd /boot/initrd.img
    boot
}
menuentry "peluchinOs Live (default verbose, KMS)" {
    linux /boot/vmlinuz boot=live components console=tty0
    initrd /boot/initrd.img
    boot
}
menuentry "peluchinOs Live (quiet splash)" {
    linux /boot/vmlinuz boot=live components quiet splash
    initrd /boot/initrd.img
    boot
}
menuentry "peluchinOs Live (safe - text console only, runlevel 3)" {
    linux /boot/vmlinuz boot=live components 3 nomodeset console=tty0
    initrd /boot/initrd.img
    boot
}
menuentry "peluchinOs Live (debug - break in initramfs)" {
    linux /boot/vmlinuz boot=live components nomodeset console=tty0 break=premount
    initrd /boot/initrd.img
    boot
}
GRUB

mksquashfs chroot iso-root/live/filesystem.squashfs \
  -noappend -comp xz -e boot
grub-mkrescue -o peluchinOs-live.iso iso-root/

ls -lah peluchinOs-live.iso
echo ">>> done. Run with:  qemu-system-x86_64 -m 2G -cdrom $WORK/peluchinOs-live.iso"
