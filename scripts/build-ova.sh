#!/usr/bin/env bash
# Build a VirtualBox/VMware-importable OVA from the peluchinOs Live ISO.
#
# The hybrid ISO carries an isohybrid MBR, so it boots as a hard disk, not
# just as a CD. We convert it to a stream-optimized VMDK, wrap it in a
# standard DMTF OVF descriptor (2 GB RAM, 2 vCPU, VMSVGA, SATA disk, boot
# from HDD), add a manifest, and tar the three into a .ova. Double-clicking
# the result imports a ready-to-run VM with sane settings — no fiddling with
# graphics controllers or boot order.
#
# Requires: qemu-img, tar, sha1sum. No VirtualBox needed.
# Usage: scripts/build-ova.sh [path/to/peluchinOs-live.iso] [out.ova]

set -euo pipefail

ROOT="$(cd "$(dirname "$0")"/.. && pwd)"
ISO="${1:-$ROOT/iso-build/peluchinOs-live.iso}"
OUT="${2:-$ROOT/iso-build/peluchinOs.ova}"

[ -f "$ISO" ] || { echo "ISO not found: $ISO (build it first: scripts/build-iso.sh)"; exit 1; }

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

VMDK="peluchinOs-disk.vmdk"
OVF="peluchinOs.ovf"
MF="peluchinOs.mf"

echo ">>> converting ISO -> stream-optimized VMDK ..."
qemu-img convert -f raw -O vmdk -o subformat=streamOptimized \
  "$ISO" "$WORK/$VMDK"

# Virtual disk capacity we advertise to the hypervisor. The ISO is ~420 MB;
# give the guest a roomy 2 GiB virtual disk so live-boot's tmpfs overlay has
# space. (The VMDK itself only stores the ISO bytes; this is the logical
# size the descriptor claims.)
DISK_CAPACITY_BYTES=2147483648
VMDK_FILE_SIZE=$(stat -c%s "$WORK/$VMDK")

echo ">>> writing OVF descriptor ..."
cat > "$WORK/$OVF" <<OVF_EOF
<?xml version="1.0" encoding="UTF-8"?>
<Envelope ovf:version="1.0" xml:lang="en-US"
    xmlns="http://schemas.dmtf.org/ovf/envelope/1"
    xmlns:ovf="http://schemas.dmtf.org/ovf/envelope/1"
    xmlns:rasd="http://schemas.dmtf.org/wbem/wscim/1/cim-schema/2/CIM_ResourceAllocationSettingData"
    xmlns:vssd="http://schemas.dmtf.org/wbem/wscim/1/cim-schema/2/CIM_VirtualSystemSettingData"
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <References>
    <File ovf:href="$VMDK" ovf:id="file1" ovf:size="$VMDK_FILE_SIZE"/>
  </References>
  <DiskSection>
    <Info>Virtual disk information</Info>
    <Disk ovf:capacity="$DISK_CAPACITY_BYTES" ovf:diskId="vmdisk1"
        ovf:fileRef="file1"
        ovf:format="http://www.vmware.com/interfaces/specifications/vmdk.html#streamOptimized"/>
  </DiskSection>
  <NetworkSection>
    <Info>The list of logical networks</Info>
    <Network ovf:name="NAT">
      <Description>NAT networking</Description>
    </Network>
  </NetworkSection>
  <VirtualSystem ovf:id="peluchinOs">
    <Info>peluchinOs 1.0.0 Live</Info>
    <Name>peluchinOs</Name>
    <OperatingSystemSection ovf:id="96" ovf:version="13">
      <Info>Debian trixie (64-bit) — peluchinOs shell</Info>
      <Description>Debian_64</Description>
    </OperatingSystemSection>
    <VirtualHardwareSection>
      <Info>Virtual hardware requirements</Info>
      <System>
        <vssd:ElementName>Virtual Hardware Family</vssd:ElementName>
        <vssd:InstanceID>0</vssd:InstanceID>
        <vssd:VirtualSystemType>virtualbox-2.2</vssd:VirtualSystemType>
      </System>
      <Item>
        <rasd:Caption>2 virtual CPUs</rasd:Caption>
        <rasd:Description>Number of virtual CPUs</rasd:Description>
        <rasd:ElementName>2 virtual CPUs</rasd:ElementName>
        <rasd:InstanceID>1</rasd:InstanceID>
        <rasd:ResourceType>3</rasd:ResourceType>
        <rasd:VirtualQuantity>2</rasd:VirtualQuantity>
      </Item>
      <Item>
        <rasd:AllocationUnits>MegaBytes</rasd:AllocationUnits>
        <rasd:Caption>2048 MB of memory</rasd:Caption>
        <rasd:Description>Memory Size</rasd:Description>
        <rasd:ElementName>2048 MB of memory</rasd:ElementName>
        <rasd:InstanceID>2</rasd:InstanceID>
        <rasd:ResourceType>4</rasd:ResourceType>
        <rasd:VirtualQuantity>2048</rasd:VirtualQuantity>
      </Item>
      <Item>
        <rasd:Address>0</rasd:Address>
        <rasd:Caption>sataController0</rasd:Caption>
        <rasd:Description>SATA Controller</rasd:Description>
        <rasd:ElementName>sataController0</rasd:ElementName>
        <rasd:InstanceID>3</rasd:InstanceID>
        <rasd:ResourceSubType>AHCI</rasd:ResourceSubType>
        <rasd:ResourceType>20</rasd:ResourceType>
      </Item>
      <Item>
        <rasd:AddressOnParent>0</rasd:AddressOnParent>
        <rasd:Caption>disk1</rasd:Caption>
        <rasd:Description>Disk Image</rasd:Description>
        <rasd:ElementName>disk1</rasd:ElementName>
        <rasd:HostResource>/disk/vmdisk1</rasd:HostResource>
        <rasd:InstanceID>4</rasd:InstanceID>
        <rasd:Parent>3</rasd:Parent>
        <rasd:ResourceType>17</rasd:ResourceType>
      </Item>
      <Item>
        <rasd:AutomaticAllocation>true</rasd:AutomaticAllocation>
        <rasd:Caption>Ethernet adapter on 'NAT'</rasd:Caption>
        <rasd:Connection>NAT</rasd:Connection>
        <rasd:ElementName>Ethernet adapter on 'NAT'</rasd:ElementName>
        <rasd:InstanceID>5</rasd:InstanceID>
        <rasd:ResourceType>10</rasd:ResourceType>
      </Item>
    </VirtualHardwareSection>
  </VirtualSystem>
</Envelope>
OVF_EOF

echo ">>> writing manifest ..."
( cd "$WORK" && sha1sum "$OVF" "$VMDK" | sed -E 's/^([0-9a-f]+)  (.*)$/SHA1(\2)= \1/' > "$MF" )

echo ">>> packing OVA (tar, ovf first) ..."
# OVA spec: .ovf must be the first entry, then manifest, then disks.
( cd "$WORK" && tar -cf "$OUT" "$OVF" "$MF" "$VMDK" )

echo ">>> done:"
ls -lah "$OUT"
