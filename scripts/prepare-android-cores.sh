#!/usr/bin/env bash
set -euo pipefail
stage=$(mktemp -d)
trap 'rm -rf "$stage"' EXIT
while read -r arch abi sha; do
  bundle="sing-box-1.10.7-android-$arch"
  archive="$stage/$bundle.tar.gz"
  curl --fail --location --retry 3 "https://github.com/SagerNet/sing-box/releases/download/v1.10.7/$bundle.tar.gz" -o "$archive"
  echo "$sha  $archive" | sha256sum -c -
  tar -xzf "$archive" -C "$stage" "$bundle/sing-box"
  install -D -m 755 "$stage/$bundle/sing-box" "android/app/src/main/jniLibs/$abi/libsingbox.so"
done <<'CORES'
armv7 armeabi-v7a cab10b5314858b7bfa86a2c2456d0ac423a86d6a0d83643cae6dd75482e3e5db
amd64 x86_64 f3fc96646bead6ef4fcfa56bdaf900ff3b24dc5f3be7b3c56d670bea6a0bc1bd
386 x86 beb195190b9cfcad396018558ac592ab3b3ca6b51ecdad8bb45697a668273132
CORES
