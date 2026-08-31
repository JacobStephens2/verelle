<script setup lang="ts">
import jsQR from "jsqr";
import { renderSVG } from "uqr";
import { computed, onUnmounted, ref, watch } from "vue";

import { useOwnerManager } from "../owners/owner-manager-store";
import { formatPairingCodeForDisplay } from "../owners/pairing-code";

const emit = defineEmits<{ close: [] }>();
const ownerManager = useOwnerManager();

type Mode = "choose" | "show" | "join";
const mode = ref<Mode>("choose");
const compactCode = ref("");
const codeInput = ref("");
const error = ref("");
const cameraStatus = ref("");
const joining = ref(false);
const video = ref<HTMLVideoElement | null>(null);
const canvas = ref<HTMLCanvasElement | null>(null);

let stream: MediaStream | null = null;
let scanFrame = 0;

const qrSvg = computed(() =>
  compactCode.value === "" ? "" : renderSVG(compactCode.value, { border: 2, ecc: "M" }),
);
const displayedCode = computed(() =>
  compactCode.value === "" ? "" : formatPairingCodeForDisplay(compactCode.value),
);

const stopCamera = () => {
  cancelAnimationFrame(scanFrame);
  for (const track of stream?.getTracks() ?? []) track.stop();
  stream = null;
};

onUnmounted(stopCamera);

const scanPairingCode = () => {
  const videoEl = video.value;
  const canvasEl = canvas.value;
  if (!videoEl || !canvasEl || stream === null) return;
  const context = canvasEl.getContext("2d", { willReadFrequently: true });
  if (context === null) return;

  const tick = () => {
    if (stream === null || joining.value) return;
    if (videoEl.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      canvasEl.width = videoEl.videoWidth;
      canvasEl.height = videoEl.videoHeight;
      if (canvasEl.width > 0 && canvasEl.height > 0) {
        context.drawImage(videoEl, 0, 0);
        const image = context.getImageData(0, 0, canvasEl.width, canvasEl.height);
        const detected = jsQR(image.data, image.width, image.height);
        if (detected?.data) {
          codeInput.value = detected.data;
          void join();
          return;
        }
      }
    }
    scanFrame = requestAnimationFrame(tick);
  };
  scanFrame = requestAnimationFrame(tick);
};

const startCamera = async () => {
  cameraStatus.value = "Opening camera…";
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: "environment" } },
    });
    if (video.value) {
      video.value.srcObject = stream;
      await video.value.play();
    }
    cameraStatus.value = "Point the camera at the other phone's pairing code.";
    scanPairingCode();
  } catch {
    cameraStatus.value = "Camera is unavailable. Type the pairing code shown on the other phone.";
  }
};

watch(mode, async (next) => {
  error.value = "";
  if (next !== "join") stopCamera();
  if (next === "show") {
    try {
      compactCode.value = await ownerManager.shareChart();
    } catch {
      error.value = "This phone could not mark the Chart as shared. Try again.";
    }
  }
});

const confirmShared = async () => {
  error.value = "";
  try {
    await ownerManager.markShared();
    emit("close");
  } catch {
    error.value = "This phone could not mark the Chart as shared. Try again.";
  }
};

const join = async () => {
  if (joining.value) return;
  joining.value = true;
  error.value = "";
  try {
    const result = await ownerManager.joinSharedOwner(codeInput.value);
    if (!result.ok) {
      error.value = result.message;
      joining.value = false;
      scanPairingCode();
      return;
    }
    stopCamera();
    globalThis.location.reload();
  } catch {
    error.value = "This phone could not join the Chart. Try again.";
    joining.value = false;
    scanPairingCode();
  }
};
</script>

<template>
  <main class="pairing" data-testid="pairing-screen">
    <header class="pairing__header">
      <button type="button" class="pairing__back" data-testid="close-pairing" @click="emit('close')">
        Back to Chart
      </button>
      <h1>Pair phones</h1>
    </header>

    <section v-if="mode === 'choose'" class="pairing__section">
      <p>
        Pairing happens in person, screen to screen. The pairing code carries the
        Shared owner between these two phones and never reaches the Relay.
      </p>
      <div class="pairing__actions">
        <button type="button" data-testid="show-pairing-code" @click="mode = 'show'">
          Show a pairing code
        </button>
        <button type="button" data-testid="join-chart" @click="mode = 'join'">
          Join with a pairing code
        </button>
      </div>
    </section>

    <section v-else-if="mode === 'show'" class="pairing__section">
      <h2>Show this code to the other phone</h2>
      <p>The other phone scans this code or types it. Keep both phones together until it joins.</p>
      <div
        v-if="qrSvg"
        class="pairing__qr"
        data-testid="pairing-qr"
        v-html="qrSvg"
      ></div>
      <p
        v-if="displayedCode"
        class="pairing__code"
        data-testid="pairing-code"
      >
        {{ displayedCode }}
      </p>
      <button
        type="button"
        class="pairing__join"
        data-testid="confirm-pairing"
        @click="confirmShared"
      >
        The other phone has joined
      </button>
      <p v-if="error" class="pairing__error" role="alert" data-testid="pairing-error">
        {{ error }}
      </p>
    </section>

    <section v-else class="pairing__section">
      <h2>Join the other phone's Chart</h2>
      <p>
        Joining uses the other phone's Chart. Observations recorded only on this
        phone will not appear on it.
      </p>
      <button
        type="button"
        data-testid="scan-pairing-code"
        @click="startCamera"
      >
        Scan with camera
      </button>
      <video
        ref="video"
        class="pairing__camera"
        autoplay
        muted
        playsinline
        data-testid="pairing-camera"
      ></video>
      <canvas ref="canvas" class="pairing__scan-canvas" hidden></canvas>
      <p class="pairing__camera-status" data-testid="pairing-camera-status">{{ cameraStatus }}</p>
      <label class="pairing__code-field">
        <span>Pairing code</span>
        <textarea
          v-model="codeInput"
          rows="4"
          autocomplete="off"
          autocapitalize="characters"
          autocorrect="off"
          :spellcheck="false"
          data-testid="pairing-code-input"
        ></textarea>
      </label>
      <button
        type="button"
        class="pairing__join"
        data-testid="submit-pairing-code"
        :disabled="joining"
        @click="join"
      >
        Join Chart
      </button>
      <p v-if="error" class="pairing__error" role="alert" data-testid="pairing-error">
        {{ error }}
      </p>
    </section>
  </main>
</template>

<style scoped>
.pairing {
  width: min(42rem, 100%);
  min-height: 100vh;
  margin: 0 auto;
  padding: calc(env(safe-area-inset-top) + 1rem) 1rem
    calc(env(safe-area-inset-bottom) + 2rem);
}

.pairing__header {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.pairing__header h1,
.pairing__section h2 {
  margin: 0;
}

.pairing__header h1 {
  font-size: 1.35rem;
}

.pairing__back,
.pairing__actions button,
.pairing__join {
  min-height: 2.75rem;
  padding: 0 0.75rem;
  border: 1px solid var(--verelle-rule);
  border-radius: 8px;
  background: var(--verelle-surface-sunken);
  color: inherit;
  font: inherit;
  font-weight: 600;
}

.pairing__section {
  margin-top: 1.5rem;
  padding: 1rem;
  border: 1px solid var(--verelle-rule);
  border-radius: 12px;
  background: var(--verelle-surface);
}

.pairing__section h2 {
  font-size: 1.1rem;
}

.pairing__actions {
  display: grid;
  gap: 0.75rem;
  margin-top: 1rem;
}

.pairing__qr {
  width: min(18rem, 100%);
  margin: 1rem auto 0;
  padding: 0.75rem;
  border-radius: 8px;
  background: #fff;
  color: #111;
}

.pairing__qr :deep(svg) {
  display: block;
  width: 100%;
  height: auto;
}

.pairing__code {
  margin: 1rem 0;
  padding: 0.75rem;
  border-radius: 8px;
  background: var(--verelle-surface-sunken);
  font-family: ui-monospace, "SFMono-Regular", Consolas, monospace;
  font-size: 0.95rem;
  letter-spacing: 0.04em;
  line-height: 1.6;
}

.pairing__camera {
  display: block;
  width: 100%;
  margin-top: 0.75rem;
  border-radius: 8px;
  background: #111;
  min-height: 10rem;
}

.pairing__camera-status,
.pairing__error {
  margin: 0.75rem 0 0;
}

.pairing__error {
  font-weight: 700;
}

.pairing__code-field {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  margin: 0.75rem 0;
  color: var(--verelle-ink-muted);
  font-size: 0.85rem;
  font-weight: 600;
}

.pairing__code-field textarea {
  width: 100%;
  padding: 0.65rem;
  border: 1px solid var(--verelle-rule);
  border-radius: 8px;
  background: var(--verelle-surface);
  color: var(--verelle-ink);
  font: inherit;
  font-weight: 400;
}
</style>
