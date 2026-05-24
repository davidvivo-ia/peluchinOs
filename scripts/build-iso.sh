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

# tty2 = live journalctl follow (no login needed). If X dies on tty1
# the user can Ctrl+Alt+F2 and watch boot/runtime logs scroll in
# real time without having to type anything.
cat > /etc/systemd/system/peluchinos-journal-tty2.service <<'CONF'
[Unit]
Description=peluchinOs journalctl follow on tty2
After=systemd-journald.service getty.target
Conflicts=getty@tty2.service

[Service]
Type=simple
StandardInput=tty
StandardOutput=tty
TTYPath=/dev/tty2
TTYReset=yes
TTYVHangup=yes
# `clear` would normally come from ncurses-bin (only a transitive
# Recommends in minbase) — use the printf ANSI fallback so this still
# works if a future build slims packages. \033c is the RIS terminal
# reset sequence; supported on every Linux VT.
ExecStart=/bin/sh -c 'printf "\\033c"; echo "[peluchinOs] live journalctl -b -f (Ctrl+Alt+F1 to return to GUI tty)"; echo; exec journalctl -b -f --no-pager'
Restart=always
# Without RestartSec systemd respawns ~10x/s on immediate-exit and
# trips StartLimitBurst (default 5 in 10 s) — the unit then gets
# parked in failed state and tty2 goes dark for the rest of the boot.
RestartSec=2s

[Install]
WantedBy=multi-user.target
CONF
systemctl enable peluchinos-journal-tty2.service >/dev/null 2>&1 || true
# autovt@.service is the template that starts getty@ on demand for
# tty2..tty6 — masking the specific instance keeps tty2 free for our
# journalctl service.
systemctl mask autovt@tty2.service getty@tty2.service >/dev/null 2>&1 || true

cat > /etc/X11/Xwrapper.config <<'CFG'
allowed_users=anybody
needs_root_rights=yes
CFG

cat > /home/peluchin/.bash_profile <<'BP'
case "$(tty)" in
  /dev/tty1)
    if [ -z "$DISPLAY" ]; then
      echo "================================================================"
      echo "[peluchinOs] boot diagnostics (tty1)"
      echo "================================================================"
      echo "kernel: $(uname -a)"
      echo "uptime: $(cat /proc/uptime)"
      echo "memory: $(free -h | head -2)"
      echo "rootfs source (should be /live/filesystem.squashfs):"
      mount | grep -E "on / |/live|squashfs" || echo "  WARN: no squashfs mount found"
      echo "loaded video modules:"
      lsmod | grep -E "drm|vmware|qxl|vesa|vbox|i915|nouveau|radeon|amdgpu" || echo "  (none)"
      echo "DRM devices:"
      ls -l /dev/dri/ 2>/dev/null || echo "  /dev/dri does not exist"
      echo "X driver candidates available:"
      ls /usr/lib/xorg/modules/drivers/ 2>/dev/null | sort
      echo "peluchinos binary:"
      ls -l /usr/bin/peluchinos 2>/dev/null || echo "  MISSING — Tauri .deb did not install"
      echo "================================================================"
      echo "Switch to tty2 (Ctrl+Alt+F2) for a live journalctl follow."
      echo "Switch to tty3..tty6 for plain shells."
      echo "================================================================"
      echo "[peluchinOs] starting X — this can take up to 30s on a cold VM..."
      startx > /tmp/startx.log 2>&1
      RC=$?
      echo
      echo "[peluchinOs] startx exited ($RC). Full /tmp/startx.log:"
      cat /tmp/startx.log 2>/dev/null || echo "(no log)"
      echo
      echo "Last 30 lines of journalctl -b:"
      journalctl -b --no-pager -n 30 2>/dev/null
      echo
      echo "Press Enter to retry startx, or switch tty for diagnostics."
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
# Print a banner on the X root window (so the user sees SOMETHING the
# moment X comes up, even before matchbox + peluchinos appear).
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

# Build-time sanity check: verify the initrd we're about to ship
# actually contains live-boot's scripts/live/ hooks. If it doesn't,
# the kernel boots fine and then the boot hangs forever at a blinking
# cursor (initramfs panics before the console is up). Fail loudly NOW
# so we never publish another broken ISO with this exact symptom.
echo ">>> verifying initrd contains live-boot scripts ..."
INITRD_LIST="$(chroot chroot lsinitramfs /boot/$(basename "$INITRD") 2>/dev/null || true)"
if ! echo "$INITRD_LIST" | grep -q 'scripts/live'; then
  echo "ERROR: initrd $INITRD has no scripts/live/ entries."
  echo "       live-boot hooks did not make it into the initramfs."
  echo "       First 40 entries of the initrd were:"
  echo "$INITRD_LIST" | head -40
  exit 1
fi
echo "    OK ($(echo "$INITRD_LIST" | grep -c scripts/live) live-boot files in initrd)"

# Embed a sizes file so we can confirm from GRUB which kernel/initrd
# were actually published (cat (cd0)/boot/SIZES.txt in the GRUB
# command line).
{
  echo "kernel:  $(basename "$VMLINUZ")  $(stat -c '%s bytes' "$VMLINUZ")"
  echo "initrd:  $(basename "$INITRD")   $(stat -c '%s bytes' "$INITRD")"
  echo "built:   $(date -u '+%Y-%m-%dT%H:%M:%SZ')"
} > iso-root/boot/SIZES.txt

# grub.cfg, DEBUG BUILD. Each entry prints what it does at GRUB level
# (so we know the file load succeeded), forces console=tty0 + serial
# (so a kernel panic on VirtualBox is actually visible AND capturable
# via a VirtualBox serial-to-file port), and turns on max kernel/
# live-boot verbosity. Multiple break=X entries let us isolate the
# failing stage if the loud-default entry still hangs.
#
# Serial console (ttyS0) lets you do this in VirtualBox:
#   Settings -> Serial Ports -> Port 1 -> Port mode: "Raw File"
#                                          Path: /tmp/peluchinOs.log
# Then boot, and even if the screen stays black, /tmp/peluchinOs.log
# captures every kernel + systemd line up to the hang point.
cat > iso-root/boot/grub/grub.cfg <<'GRUB'
set timeout=30
set timeout_style=menu
set default=0
set pager=0

insmod all_video
insmod gfxterm
insmod echo
insmod cat
insmod ls
insmod serial
if loadfont unicode ; then
  terminal_output gfxterm
fi

# Mirror GRUB output to COM1 so even GRUB's banner + menuentry exec
# is captured by VirtualBox's "Serial Port 1 -> Raw File". Without
# this, only kernel/userspace output reaches the serial log.
serial --unit=0 --speed=115200
terminal_input --append serial
terminal_output --append serial

set color_normal=light-gray/black
set color_highlight=black/cyan

echo "   peluchinOs Live ISO  -  DEBUG BUILD"
echo "   ------------------------------------------------------"
echo "   Pick (1) first.  Entry 1 prints what it's doing and"
echo "   pauses 8 s before the kernel takes over, so you have"
echo "   visible proof that GRUB advanced past file-load even"
echo "   if the kernel itself stays silent on your VM."
echo ""
echo "   If after picking (1) you ONLY see a blinking cursor for"
echo "   90+ s, the kernel is loading but VirtualBox is not"
echo "   painting its output.  Workarounds:"
echo "    - Settings -> Display -> Graphics Controller = VMSVGA"
echo "    - Settings -> System -> Acceleration = enable VT-x"
echo "    - Try entry (4) runlevel 3 (text-only, smaller surface)"
echo "    - Try entry (a) serial-only (output only to COM1)"
echo ""

menuentry "1. Safe boot (visible 8s countdown before handoff)" {
    echo ""
    echo "    >>> Loading kernel  /boot/vmlinuz ..."
    linux /boot/vmlinuz boot=live components nomodeset console=tty0 console=ttyS0,115200n8
    echo "    >>> Loading initrd  /boot/initrd.img ..."
    initrd /boot/initrd.img
    echo ""
    echo "    >>> All loaded.  The screen WILL go black when the kernel"
    echo "    >>> takes over - that is normal.  In VirtualBox with"
    echo "    >>> VT-x ON you should see the peluchinOs desktop within"
    echo "    >>> 30-60 s.  Without VT-x allow 2-3 MINUTES."
    echo ""
    echo "    >>> Booting in:"
    sleep --verbose --interruptible 8
    boot
}

menuentry "2. Loud verbose boot  -  full kernel + live-boot debug" {
    echo ">>> Loading /boot/vmlinuz ..."
    linux /boot/vmlinuz boot=live components nomodeset console=tty0 console=ttyS0,115200n8 debug ignore_loglevel loglevel=8 printk.time=1 systemd.log_level=info systemd.log_target=kmsg
    echo ">>> Loading /boot/initrd.img ..."
    initrd /boot/initrd.img
    echo ">>> Handing off to kernel ..."
    boot
}

menuentry "3. Default verbose KMS  -  no nomodeset, uses real DRM driver" {
    echo ">>> Loading kernel (KMS mode) ..."
    linux /boot/vmlinuz boot=live components console=tty0 console=ttyS0,115200n8 debug ignore_loglevel loglevel=8 printk.time=1
    initrd /boot/initrd.img
    boot
}

menuentry "4. Runlevel 3 (text console, no X)  -  smaller surface, no display switch" {
    linux /boot/vmlinuz boot=live components 3 nomodeset console=tty0 console=ttyS0,115200n8 debug ignore_loglevel loglevel=8
    initrd /boot/initrd.img
    boot
}

menuentry "5. Serial-only boot  -  console ONLY on COM1, NO video output expected" {
    echo "After booting this entry the screen stays blank by design."
    echo "All output goes to COM1.  Set up VirtualBox Serial Port 1"
    echo "in Raw File mode to a host file BEFORE picking this."
    sleep --verbose --interruptible 5
    linux /boot/vmlinuz boot=live components nomodeset console=ttyS0,115200n8 debug ignore_loglevel loglevel=8 printk.time=1
    initrd /boot/initrd.img
    boot
}

menuentry "6. Quiet splash  -  normal boot once ISO is known good" {
    linux /boot/vmlinuz boot=live components quiet splash
    initrd /boot/initrd.img
    boot
}

menuentry "7. DEBUG: break before mounting squashfs (initramfs busybox shell)" {
    echo "Will drop into an initramfs shell BEFORE mounting /live/."
    echo "Useful commands inside:"
    echo "  ls /         - what initramfs has"
    echo "  cat /scripts/live  - the live-boot script"
    echo "  blkid        - what devices live-boot can see"
    echo "  ls /run/live - what live-boot already detected"
    echo "  exit         - resume boot"
    linux /boot/vmlinuz boot=live components nomodeset console=tty0 console=ttyS0,115200n8 debug ignore_loglevel loglevel=8 break=mountroot
    initrd /boot/initrd.img
    boot
}

menuentry "8. DEBUG: break AFTER mounting squashfs (rootfs busybox shell)" {
    echo "Will drop into a shell AFTER /live/filesystem.squashfs is"
    echo "mounted as the rootfs, but BEFORE init takes over."
    echo "  ls /run/live/medium  - the live medium"
    echo "  ls /root             - the squashfs rootfs"
    linux /boot/vmlinuz boot=live components nomodeset console=tty0 console=ttyS0,115200n8 debug ignore_loglevel loglevel=8 break=bottom
    initrd /boot/initrd.img
    boot
}

menuentry "9. DEBUG: break at TOP of initramfs (very first thing)" {
    linux /boot/vmlinuz boot=live components nomodeset console=tty0 console=ttyS0,115200n8 debug ignore_loglevel loglevel=8 break=top
    initrd /boot/initrd.img
    boot
}

menuentry "a. Single-user (rescue)  -  rootfs mounted, runlevel 1, root shell" {
    linux /boot/vmlinuz boot=live components nomodeset console=tty0 console=ttyS0,115200n8 single
    initrd /boot/initrd.img
    boot
}

menuentry "b. GRUB cat  -  show /boot/SIZES.txt and stay in GRUB" {
    cat /boot/SIZES.txt
    echo ""
    echo "Press Esc to return to the menu."
    sleep -i 600
}
GRUB

# lz4 instead of xz: roughly 5x faster decompression at boot time
# (which IS the dominant cost of the live-boot stage) at the price of
# +20% on-disk size. Boot under software emulation drops from ~3 min
# to ~40 s in our QEMU TCG test, and from ~60 s to ~15 s under
# VirtualBox with VT-x. Worth every byte.
mksquashfs chroot iso-root/live/filesystem.squashfs \
  -noappend -comp lz4 -e boot
grub-mkrescue -o peluchinOs-live.iso iso-root/

ls -lah peluchinOs-live.iso
echo ">>> done. Run with:  qemu-system-x86_64 -m 2G -cdrom $WORK/peluchinOs-live.iso"
