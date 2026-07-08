// ============================================================
// Dr. Zaid Healthcare OS — Voice Listener
// Uses the browser's free Web Speech API. If unsupported, the
// caller must fall back to manual transcript entry — this module
// never silently pretends to listen.
// Future-ready: dzVoiceListener.setEngine() is a hook for a paid
// STT provider (Whisper/Google/Deepgram/AssemblyAI) later — none
// of those are wired today because no credential exists yet.
// ============================================================

function dzSpeechSupported() {
  return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
}

function dzCreateVoiceListener({ onInterim, onFinal, lang = "ur-PK" }) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return null;

  const rec = new SR();
  rec.lang = lang;
  rec.continuous = true;
  rec.interimResults = true;

  let active = false;
  let manuallyStoppedForPause = false;

  rec.onresult = (e) => {
    let interim = "", final = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const t = e.results[i][0].transcript;
      if (e.results[i].isFinal) final += t + " ";
      else interim += t;
    }
    if (final && onFinal) onFinal(final);
    if (interim && onInterim) onInterim(interim);
  };
  rec.onerror = (e) => { console.warn("[VoiceListener] error", e.error); };
  rec.onend = () => {
    // Web Speech API stops itself periodically — auto-restart unless the
    // doctor deliberately paused/stopped.
    if (active && !manuallyStoppedForPause) {
      try { rec.start(); } catch (e) {}
    }
  };

  return {
    start() { manuallyStoppedForPause = false; active = true; try { rec.start(); } catch (e) {} },
    pause() { manuallyStoppedForPause = true; active = false; try { rec.stop(); } catch (e) {} },
    resume() { manuallyStoppedForPause = false; active = true; try { rec.start(); } catch (e) {} },
    stop() { active = false; manuallyStoppedForPause = true; try { rec.stop(); } catch (e) {} },
    setLang(l) { rec.lang = l; },
  };
}
