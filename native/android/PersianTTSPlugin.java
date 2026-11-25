package com.voicecastai.app;

import android.media.AudioFormat;
import android.media.AudioManager;
import android.media.AudioTrack;
import android.media.PlaybackParams;
import android.os.Build;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.JSObject;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.k2fsa.sherpa.onnx.*;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicInteger;

@CapacitorPlugin(name = "PersianTTS")
public class PersianTTSPlugin extends Plugin {
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private final AtomicInteger runToken = new AtomicInteger(0);
    private volatile AudioTrack audioTrack;

    @PluginMethod
    public void speak(PluginCall call) {
        final String text = call.getString("text", "");
        final String voiceId = call.getString("voiceId", "amir");
        final float speed = call.getDouble("speed", 1.0).floatValue();
        final float pitch = call.getDouble("pitch", 1.0).floatValue();
        final float volume = call.getDouble("volume", 1.0).floatValue();
        if (text.trim().isEmpty()) { call.reject("متنی برای خواندن وجود ندارد."); return; }
        if (!voiceId.matches("amir|gyro|ganji")) { call.reject("مدل صدای انتخاب‌شده معتبر نیست."); return; }
        final int token = runToken.incrementAndGet();
        worker.execute(() -> {
            OfflineTts tts = null;
            AudioTrack track = null;
            try {
                stopTrack();
                File root = new File(getContext().getFilesDir(), "persian-tts");
                File modelDir = new File(root, voiceId);
                File model = new File(modelDir, "model.onnx");
                File tokens = new File(modelDir, "tokens.txt");
                File espeak = new File(root, "espeak-ng-data");
                if (!model.exists() || !tokens.exists()) copyAssetTree("persian-tts/" + voiceId, modelDir);
                if (!new File(espeak, "phontab").exists()) copyAssetTree("persian-tts/espeak-ng-data", espeak);
                if (!model.exists() || !tokens.exists() || !new File(espeak, "phontab").exists()) {
                    throw new IllegalStateException("فایل‌های صدای فارسی کامل نیستند.");
                }

                OfflineTtsVitsModelConfig vits = new OfflineTtsVitsModelConfig();
                vits.setModel(model.getAbsolutePath());
                vits.setTokens(tokens.getAbsolutePath());
                vits.setDataDir(espeak.getAbsolutePath());
                OfflineTtsModelConfig modelConfig = new OfflineTtsModelConfig();
                modelConfig.setVits(vits);
                // Keep inference conservative on mid-range Android devices to avoid memory pressure.
                modelConfig.setNumThreads(1);
                modelConfig.setDebug(false);
                OfflineTtsConfig config = new OfflineTtsConfig();
                config.setModel(modelConfig);
                config.setMaxNumSentences(1);
                tts = new OfflineTts(getContext().getAssets(), config);

                GenerationConfig generation = new GenerationConfig();
                generation.setSid(0);
                generation.setSpeed(Math.max(0.65f, Math.min(1.5f, speed)));
                generation.setSilenceScale(0.2f);
                final int activeToken = token;
                GeneratedAudio generated = tts.generateWithConfig(text, generation);
                if (token != runToken.get()) { call.reject("پخش متوقف شد."); return; }

                float[] samples = generated.getSamples();
                int sampleRate = generated.getSampleRate();
                int min = AudioTrack.getMinBufferSize(sampleRate, AudioFormat.CHANNEL_OUT_MONO, AudioFormat.ENCODING_PCM_16BIT);
                int bufferSize = Math.max(min, 4096);
                track = new AudioTrack(AudioManager.STREAM_MUSIC, sampleRate,
                    AudioFormat.CHANNEL_OUT_MONO, AudioFormat.ENCODING_PCM_16BIT,
                    bufferSize, AudioTrack.MODE_STREAM);
                audioTrack = track;
                track.setVolume(Math.max(0f, Math.min(1f, volume)));
                if (Build.VERSION.SDK_INT >= 23) {
                    try { track.setPlaybackParams(new PlaybackParams().setPitch(Math.max(0.7f, Math.min(1.35f, pitch)))); }
                    catch (Exception ignored) {}
                }
                track.play();
                short[] pcm = new short[2048];
                for (int offset = 0; offset < samples.length && token == runToken.get(); offset += pcm.length) {
                    int count = Math.min(pcm.length, samples.length - offset);
                    for (int i = 0; i < count; i++) {
                        float value = Math.max(-1f, Math.min(1f, samples[offset + i]));
                        pcm[i] = (short) (value * 32767f);
                    }
                    int written = track.write(pcm, 0, count);
                    if (written < 0) throw new IllegalStateException("خطای خروجی صدا: " + written);
                }
                if (token == runToken.get()) {
                    while (track.getPlaybackHeadPosition() < samples.length && token == runToken.get()) {
                        try { Thread.sleep(35); } catch (InterruptedException ignored) { Thread.currentThread().interrupt(); break; }
                    }
                    call.resolve(new JSObject());
                } else {
                    call.reject("پخش متوقف شد.");
                }
            } catch (Throwable e) {
                String detail = e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage();
                call.reject("خطا در اجرای صدای فارسی: " + detail);
            } finally {
                if (track != null) {
                    try { track.pause(); track.flush(); track.stop(); } catch (Throwable ignored) {}
                    try { track.release(); } catch (Throwable ignored) {}
                }
                if (audioTrack == track) audioTrack = null;
                if (tts != null) { try { tts.release(); } catch (Throwable ignored) {} }
            }
        });
    }

    @PluginMethod
    public void pause(PluginCall call) {
        AudioTrack current = audioTrack;
        if (current != null) { try { current.pause(); } catch (Exception ignored) {} }
        call.resolve(new JSObject());
    }

    @PluginMethod
    public void resume(PluginCall call) {
        AudioTrack current = audioTrack;
        if (current != null) { try { current.play(); } catch (Exception ignored) {} }
        call.resolve(new JSObject());
    }

    @PluginMethod
    public void stop(PluginCall call) {
        runToken.incrementAndGet();
        stopTrack();
        call.resolve(new JSObject());
    }

    private void stopTrack() {
        AudioTrack current = audioTrack;
        if (current != null) {
            try { current.pause(); current.flush(); current.stop(); } catch (Throwable ignored) {}
        }
    }

    private void copyAssetTree(String assetPath, File destination) throws Exception {
        String[] children = getContext().getAssets().list(assetPath);
        if (children == null || children.length == 0) {
            destination.getParentFile().mkdirs();
            try (InputStream in = getContext().getAssets().open(assetPath);
                 FileOutputStream out = new FileOutputStream(destination)) {
                byte[] buffer = new byte[65536];
                int n;
                while ((n = in.read(buffer)) > 0) out.write(buffer, 0, n);
            }
            return;
        }
        destination.mkdirs();
        for (String child : children) copyAssetTree(assetPath + "/" + child, new File(destination, child));
    }
}
