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
#    --include MUST be one line: continuations inside the single-quoted
#    arg keep their indentation spaces as part of the package name and
#    apt then can't resolve them.
echo ">>> bootstrapping Debian trixie ..."
rm -rf chroot && mkdir chroot
# Package roll-call:
#  - linux-image-amd64 + firmware-linux-free: kernel + free firmware
#    blobs every modern x86 platform asks for at probe time.
#  - live-boot + live-boot-initramfs-tools + initramfs-tools: required
#    so the initrd contains /scripts/live (otherwise the kernel boots
#    and the initramfs has no idea how to find /live/filesystem.squashfs).
#  - systemd-sysv: pid 1.  dbus: needed by webkit2gtk + matchbox.
#  - kbd: console keymap.  sudo: passwordless wheel for peluchin.
#  - procps + pciutils: for free/ps and lspci diagnostics on tty1.
#  - xserver-xorg-core + xserver-xorg-legacy: X with permissive wrapper.
#  - xserver-xorg-input-libinput: PS/2 + USB keyboard/mouse via libinput.
#  - xserver-xorg-video-*: every video driver that can possibly match
#    a Virtual{Box,VMware} or QEMU GPU - vesa is the universal fallback,
#    fbdev hits the kernel framebuffer, modesetting drives any DRM
#    device (including vboxvideo's drm node and vmwgfx).
#  - xinit + matchbox-window-manager: kiosk session.
#  - libgtk-3-0 + libwebkit2gtk-4.1-0 + libayatana-appindicator3-1
#    + librsvg2-2 + libssl3 + fonts-dejavu-core: Tauri runtime.
#  - locales: UTF-8.
mmdebstrap --variant=minbase \
  --include='linux-image-amd64,firmware-linux-free,live-boot,live-boot-initramfs-tools,initramfs-tools,systemd-sysv,dbus,kbd,sudo,procps,pciutils,ca-certificates,xserver-xorg-core,xserver-xorg-legacy,xserver-xorg-input-libinput,xserver-xorg-video-fbdev,xserver-xorg-video-vesa,xserver-xorg-video-qxl,xserver-xorg-video-vmware,xserver-xorg-video-modesetting,xinit,matchbox-window-manager,libgtk-3-0,libwebkit2gtk-4.1-0,libayatana-appindicator3-1,librsvg2-2,libssl3,fonts-dejavu-core,locales' \
  trixie chroot http://deb.debian.org/debian

# 2/3/4. Install peluchinOs, autologin, kiosk session.
echo ">>> configuring chroot ..."
cp "$DEB" chroot/tmp/peluchinos.deb
chroot chroot /bin/bash -e <<'EOF'
export DEBIAN_FRONTEND=noninteractive
# Force a sane TMPDIR.  If the host's shell exported one that doesn't
# exist inside the chroot (e.g. /tmp/<sandbox-uuid>), package postinst
# scripts that call mktemp die — observed with apparmor 4.x pulled in
# as a dep of kernel 7.0 from sid.
export TMPDIR=/tmp
echo peluchinos > /etc/hostname
echo "127.0.0.1 localhost peluchinos" > /etc/hosts

# Upgrade kernel to the newest one available in Debian sid (everything
# else stays on trixie so the Tauri .deb's deps don't shift under us).
# Pinning: trixie is the default for every package; sid is allowed
# ONLY for linux-image* and firmware-linux* and their build deps so
# the new kernel's matching firmware lines up.  Without this we'd be
# stuck on trixie's 6.12 LTS forever.
echo "deb http://deb.debian.org/debian sid main" > /etc/apt/sources.list.d/sid-kernel.list
cat > /etc/apt/preferences.d/99-latest-kernel <<'PIN'
Package: *
Pin: release n=trixie
Pin-Priority: 900

Package: *
Pin: release n=sid
Pin-Priority: 1

Package: linux-image-amd64 linux-image-*-amd64 linux-base linux-headers-* firmware-linux-free firmware-linux*
Pin: release n=sid
Pin-Priority: 990
PIN
apt-get update
# `apt-get install` on already-installed packages upgrades them if the
# pin priority of a newer version is higher than the installed one —
# which is the case here (sid is 990, installed-from-trixie is 900).
apt-get install -y linux-image-amd64 firmware-linux-free
# After the upgrade the linux-image-amd64 metapackage points at exactly
# one version-specific linux-image-X.Y-amd64 (visible via apt-cache
# depends).  That's the kernel we want to ship; purge every OTHER
# version-specific kernel + matching modules package.
#
# Why not just `apt-get autoremove --purge`?  mmdebstrap installs the
# trixie kernel's specific package as `manual` (it's a transitive dep
# of the meta-package the user listed in --include).  `apt-mark auto`
# on it claims success but autoremove still leaves it alone.  Explicit
# purge by name is the only reliable path.
WANTED_IMG="$(apt-cache depends linux-image-amd64 2>/dev/null \
                | awk '/Depends: linux-image-[0-9]/{print $2; exit}')"
[ -n "$WANTED_IMG" ] || { echo "ERROR: could not resolve linux-image-amd64 dep"; exit 1; }
echo ">>> keeping kernel package: $WANTED_IMG"
dpkg-query -W -f='${binary:Package}\n' 'linux-image-[0-9]*-amd64' 2>/dev/null | \
  while read -r pkg; do
    [ "$pkg" = "$WANTED_IMG" ] && continue
    echo ">>> purging orphan kernel package: $pkg"
    # Two independent purges: the matching linux-modules package may
    # not exist (trixie bundled modules inside linux-image; sid splits
    # them).  A single combined `apt-get purge $a $b` aborts entirely
    # if EITHER package is missing — so split the calls.
    apt-get purge -y "$pkg" || true
    apt-get purge -y "linux-modules-${pkg#linux-image-}" 2>/dev/null || true
  done
apt-get autoremove --purge -y
# Assert exactly one kernel survived.  If the explicit purge missed
# something the squashfs would carry two complete /lib/modules/ trees
# and our `ls vmlinuz-* | sort -V | tail -n1` selection later could
# silently pick a different kernel from the one whose modules ship.
NKERNELS=$(ls -1 /boot/vmlinuz-* 2>/dev/null | wc -l)
if [ "$NKERNELS" -ne 1 ]; then
  echo "ERROR: expected exactly 1 kernel in /boot/, got $NKERNELS"
  ls /boot/
  exit 1
fi
# Sid sources/pins were a one-shot for the kernel — strip them so the
# booted live image doesn't accidentally pull from sid at runtime.
rm /etc/apt/sources.list.d/sid-kernel.list /etc/apt/preferences.d/99-latest-kernel
apt-get update

dpkg -i /tmp/peluchinos.deb || true
# Don't silence apt — if the .deb has an unmet dep we want the build
# log to show exactly which package apt-get -f had to pull.
apt-get install -y -f
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

# Xorg fallback Device section.  With `nomodeset` (entries 1/2) no DRM
# device is created, so X auto-config sometimes concludes "no display
# devices detected" and exits.  This Device section is loaded by X
# only when nothing else has matched — it's a Device-only stanza, no
# Screen or ServerLayout, so it doesn't force the driver when better
# auto-detection options exist.  vesa works on EVERY VGA-compatible
# card peluchinOs could land on (VBoxVGA legacy, VBoxSVGA, VMSVGA,
# QEMU stdvga, real bare-metal hardware).
mkdir -p /etc/X11/xorg.conf.d
cat > /etc/X11/xorg.conf.d/10-peluchinos-fallback.conf <<'XCONF'
Section "Device"
    Identifier "peluchinOs vesa fallback"
    Driver "vesa"
EndSection
XCONF
# Allow X autoconfigure to start without any input device too.  In a
# headless boot test (CI), there might not be a synthetic mouse/keyboard
# yet when X starts; AllowEmptyInput=true keeps X from refusing to run.
cat > /etc/X11/xorg.conf.d/20-peluchinos-server-flags.conf <<'XCONF'
Section "ServerFlags"
    Option "AllowEmptyInput" "true"
    Option "AutoAddDevices" "true"
    Option "DontVTSwitch" "false"
EndSection
XCONF

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
      echo "PCI display adapter (what the kernel sees as the GPU):"
      lspci -nn 2>/dev/null | grep -iE "vga|display|3d" || echo "  no display PCI device"
      echo "loaded video modules:"
      lsmod 2>/dev/null | grep -E "^(drm|vmwgfx|qxl|vboxvideo|bochs|cirrus|vesafb|i915|nouveau|radeon|amdgpu)" || echo "  (none loaded — falling back to vesafb / vgacon)"
      echo "kernel framebuffer devices:"
      ls -l /dev/fb* 2>/dev/null || echo "  no /dev/fb* device"
      echo "DRM devices:"
      ls -l /dev/dri/ 2>/dev/null || echo "  /dev/dri does not exist"
      echo "X driver candidates available:"
      ls /usr/lib/xorg/modules/drivers/ 2>/dev/null | sort
      echo "peluchinos binary:"
      ls -l /usr/bin/peluchinos 2>/dev/null || echo "  MISSING — Tauri .deb did not install"
      echo "last 10 lines of dmesg (recent kernel errors, if any):"
      dmesg --color=never 2>/dev/null | tail -10 || echo "  (dmesg restricted)"
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
# Disable screen blanking / DPMS - kiosk session, never sleep.
xset s off -dpms s noblank 2>/dev/null
# Paint the X root window teal IMMEDIATELY so the user sees a clear
# transition the moment X comes up (no more "the screen is still
# black, did X die?" ambiguity).
xsetroot -solid '#008080' 2>/dev/null
# Launch matchbox in the background and wait until it has registered
# itself as the WM before exec'ing the app.  On slow VMs the previous
# fixed `sleep 0.5` was racy - peluchinos sometimes opened before
# matchbox claimed the root window and ended up with default decor.
matchbox-window-manager -use_titlebar no -use_cursor yes &
MBPID=$!
for _ in 1 2 3 4 5 6 7 8 9 10; do
  sleep 0.3
  # /tmp/.X11-unix/X0 exists once X is up; matchbox responds to
  # X events once it's the manager.  Poll for the WM process.
  kill -0 "$MBPID" 2>/dev/null && pgrep -x matchbox-window-manager >/dev/null && break
done
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

# Build-time sanity check: the initrd we're about to ship must contain
# live-boot's scripts/live/ hooks, otherwise the kernel boots and the
# initramfs panics with no way to find the squashfs.  Capture lsinitramfs's
# stderr separately so a tool-level failure (renamed kernel, missing
# lsinitramfs, etc.) is diagnosable instead of silent.
echo ">>> verifying initrd contains live-boot scripts ..."
INITRD_NAME="$(basename "$INITRD")"
INITRD_LIST="$(chroot chroot lsinitramfs "/boot/$INITRD_NAME" 2>/tmp/lsinitramfs.err || true)"
if ! echo "$INITRD_LIST" | grep -q 'scripts/live'; then
  echo "ERROR: /boot/$INITRD_NAME has no scripts/live/ entries — live-boot"
  echo "       hooks did not make it into the initramfs."
  if [ -s /tmp/lsinitramfs.err ]; then
    echo "       lsinitramfs stderr:"
    sed 's/^/         /' /tmp/lsinitramfs.err
  fi
  echo "       First 40 entries of the initrd were:"
  echo "$INITRD_LIST" | head -40
  exit 1
fi
echo "    OK ($(echo "$INITRD_LIST" | grep -c scripts/live) live-boot files in initrd)"

# Embed a sizes file so the GRUB "cat /boot/SIZES.txt" entry can prove
# which kernel/initrd were actually published.
# Use the commit hash (or SOURCE_DATE_EPOCH if exported) instead of
# `date -u` so two builds of the same commit produce the same SIZES.txt
# — wall-clock timestamps were the main thing pushing the ISO SHA256
# around between identical-code rebuilds.
SHORT_SHA="$(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null || echo local)"
if [ -n "${SOURCE_DATE_EPOCH:-}" ]; then
  BUILT="$(date -u -d "@$SOURCE_DATE_EPOCH" '+%Y-%m-%dT%H:%M:%SZ')"
else
  BUILT="commit-$SHORT_SHA"
fi
{
  echo "kernel:  $(basename "$VMLINUZ")  $(stat -c '%s bytes' "$VMLINUZ")"
  echo "initrd:  $(basename "$INITRD")   $(stat -c '%s bytes' "$INITRD")"
  echo "commit:  $SHORT_SHA"
  echo "built:   $BUILT"
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

menuentry "1. Safe boot (VGA text mode, max VirtualBox compatibility)" {
    echo ""
    echo "    >>> Loading kernel  /boot/vmlinuz ..."
    # CONSOLE ORDER MATTERS!  The LAST `console=` becomes /dev/console,
    # the device userspace (systemd, agetty, etc.) writes to.  If we put
    # console=ttyS0 last, every systemd '[ OK ] Started X' line goes to
    # the serial port and NOT to the VGA screen — the user sees kernel
    # boot text then a black screen even though systemd is happily
    # running.  Put tty0 LAST so userspace prints to the screen; ttyS0
    # is still listed first and still receives all kernel printk for
    # serial capture.
    # gfxpayload=text:  GRUB 2.x replacement for the deprecated
    #                   `vga=normal` kernel arg — keeps the BIOS text
    #                   mode 80x25 active across the linux/initrd handoff.
    # nomodeset:        disable KMS (no driver-mediated mode switch)
    # nofb:             disable kernel framebuffer (no vesafb takeover)
    # loglevel=7 printk.time=1:  visible info-level kernel messages
    set gfxpayload=text
    linux /boot/vmlinuz boot=live components nomodeset nofb console=ttyS0,115200n8 console=tty0 loglevel=7 printk.time=1
    echo "    >>> Loading initrd  /boot/initrd.img ..."
    initrd /boot/initrd.img
    echo ""
    echo "    >>> All loaded.  Kernel about to take over the console."
    echo "    >>> You will see kernel messages scroll, then systemd,"
    echo "    >>> then auto-login, then the peluchinOs desktop."
    echo "    >>> In VirtualBox with VT-x ON: 30-60 s to desktop."
    echo "    >>> Without VT-x or on slow host: 2-3 MINUTES."
    echo ""
    echo "    >>> Booting in (press any key to abort):"
    sleep --verbose --interruptible 8
    boot
}

menuentry "2. Loud verbose boot  -  full kernel + live-boot debug (VGA-safe)" {
    echo ">>> Loading /boot/vmlinuz ..."
    # Same VGA-text safety as entry 1 (gfxpayload + nofb) so VBoxVGA-legacy
    # users get verbose output AND a screen that renders, not "loud and blank".
    set gfxpayload=text
    linux /boot/vmlinuz boot=live components nomodeset nofb console=ttyS0,115200n8 console=tty0 debug ignore_loglevel loglevel=8 printk.time=1 systemd.log_level=info systemd.log_target=kmsg
    echo ">>> Loading /boot/initrd.img ..."
    initrd /boot/initrd.img
    echo ">>> Handing off to kernel ..."
    boot
}

menuentry "3. Default verbose KMS  -  no nomodeset, uses real DRM driver" {
    echo ">>> Loading kernel (KMS mode) ..."
    linux /boot/vmlinuz boot=live components console=ttyS0,115200n8 console=tty0 debug ignore_loglevel loglevel=8 printk.time=1
    initrd /boot/initrd.img
    boot
}

menuentry "4. Runlevel 3 (text console, no X)  -  smaller surface, no display switch" {
    linux /boot/vmlinuz boot=live components 3 nomodeset console=ttyS0,115200n8 console=tty0 debug ignore_loglevel loglevel=8
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
    # quiet+splash only suppresses VGA verbosity; keep the serial port
    # going so a panic here is still capturable from VBox's Raw File.
    linux /boot/vmlinuz boot=live components quiet splash console=ttyS0,115200n8 console=tty0
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
    linux /boot/vmlinuz boot=live components nomodeset console=ttyS0,115200n8 console=tty0 debug ignore_loglevel loglevel=8 break=mountroot
    initrd /boot/initrd.img
    boot
}

menuentry "8. DEBUG: break AFTER mounting squashfs (rootfs busybox shell)" {
    echo "Will drop into a shell AFTER /live/filesystem.squashfs is"
    echo "mounted as the rootfs, but BEFORE init takes over."
    echo "  ls /run/live/medium  - the live medium"
    echo "  ls /root             - the squashfs rootfs"
    linux /boot/vmlinuz boot=live components nomodeset console=ttyS0,115200n8 console=tty0 debug ignore_loglevel loglevel=8 break=bottom
    initrd /boot/initrd.img
    boot
}

menuentry "9. DEBUG: break at TOP of initramfs (very first thing)" {
    linux /boot/vmlinuz boot=live components nomodeset console=ttyS0,115200n8 console=tty0 debug ignore_loglevel loglevel=8 break=top
    initrd /boot/initrd.img
    boot
}

menuentry "a. Single-user (rescue)  -  rootfs mounted, runlevel 1, root shell" {
    linux /boot/vmlinuz boot=live components nomodeset console=ttyS0,115200n8 console=tty0 single
    initrd /boot/initrd.img
    boot
}

menuentry "b. GRUB cat  -  show /boot/SIZES.txt and stay in GRUB" {
    cat /boot/SIZES.txt
    echo ""
    echo "Press Enter to return to the menu."
    # `read` blocks until Enter — `sleep -i 600` (previous code) auto-
    # continued after 10 min and the default entry would then boot.
    read _dummy
}

menuentry "c. Boot from first hard drive (chainload MBR)" {
    # Standard live-ISO convention.  If you booted the ISO in a VM that
    # already has an OS installed, pick this to chainload the local disk
    # instead of going into peluchinOs.  Returns to this menu on failure.
    set root=(hd0)
    chainloader +1
    boot
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

# Final summary — useful in CI logs and for quick "did the bytes change?"
# checks when iterating on the script.
echo ""
echo "=== build summary ==="
echo "kernel:  $(basename "$VMLINUZ")"
echo "initrd:  $(basename "$INITRD")"
echo "commit:  $SHORT_SHA"
echo "iso:     peluchinOs-live.iso $(du -h peluchinOs-live.iso | cut -f1)"
echo "sha256:  $(sha256sum peluchinOs-live.iso | cut -d' ' -f1)"
echo ""
echo ">>> done. Run with:  qemu-system-x86_64 -m 2G -cdrom $WORK/peluchinOs-live.iso"
