#!/usr/bin/env bash
set -euo pipefail
ROOT="$(pwd)"
ASSET="$ROOT/android/app/src/main/assets/persian-tts"
TMP="$ROOT/.tts-models"
mkdir -p "$ASSET" "$TMP"
BASE="https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models"
for voice in amir gyro ganji; do
  archive="vits-piper-fa_IR-${voice}-medium.tar.bz2"
  echo "Downloading Persian voice: $voice"
  curl --retry 4 --retry-delay 2 -fL "$BASE/$archive" -o "$TMP/$archive"
  mkdir -p "$TMP/$voice"
  tar -xjf "$TMP/$archive" -C "$TMP/$voice"
  model_file="$(find "$TMP/$voice" -type f -name '*.onnx' | head -n 1)"
  token_file="$(find "$TMP/$voice" -type f -name 'tokens.txt' | head -n 1)"
  espeak_dir="$(find "$TMP/$voice" -type d -name 'espeak-ng-data' | head -n 1)"
  test -n "$model_file" && test -n "$token_file" && test -n "$espeak_dir"
  mkdir -p "$ASSET/$voice"
  cp "$model_file" "$ASSET/$voice/model.onnx"
  cp "$token_file" "$ASSET/$voice/tokens.txt"
  if [ ! -d "$ASSET/espeak-ng-data" ]; then cp -R "$espeak_dir" "$ASSET/espeak-ng-data"; fi
  rm -f "$TMP/$archive"
done
# Register the local native Capacitor plugin in the generated Android shell.
mkdir -p android/app/src/main/java/com/voicecastai/app
cp native/android/PersianTTSPlugin.java android/app/src/main/java/com/voicecastai/app/PersianTTSPlugin.java
cat > android/app/src/main/java/com/voicecastai/app/MainActivity.java <<'JAVA'
package com.voicecastai.app;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    registerPlugin(PersianTTSPlugin.class);
    super.onCreate(savedInstanceState);
  }
}
JAVA
# Sherpa-ONNX Java API plus Android native runtime.
grep -q 'jitpack.io' android/build.gradle || sed -i "/mavenCentral()/a\\        maven { url 'https://jitpack.io' }" android/build.gradle
grep -q 'com.github.k2-fsa:sherpa-onnx' android/app/build.gradle || sed -i "/dependencies {/a\\    implementation('com.github.k2-fsa:sherpa-onnx:v2.0.1') { exclude group: 'com.github.k2-fsa.sherpa-onnx', module: 'sherpa-onnx-jvm' }" android/app/build.gradle
echo "Offline Persian voices staged:"
du -sh "$ASSET"
