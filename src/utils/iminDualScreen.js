// ============================================================================
// IMIN DUAL SCREEN NATIVE SDK UTILITY
// ============================================================================
//
// Detects and communicates with the native rear customer-facing display
// on iMin POS hardware (Swan 2, Swan 1, D4, Falcon, etc.) using official
// injected JS SDK bridges. Avoids mirroring when native API is available.
//
// ============================================================================

export function initIminDualScreen() {
  if (typeof window === 'undefined') return false;

  const url = window.location.origin + '/pantalla-cliente';
  console.log(`📺 iMin Dual Screen: Intentando proyectar URL independiente: ${url}`);

  // 1. Try IminDoubleScreen official injected WebView SDK
  if (window.IminDoubleScreen) {
    try {
      if (typeof window.IminDoubleScreen.initDoubleScreen === 'function') {
        window.IminDoubleScreen.initDoubleScreen();
      }
      if (typeof window.IminDoubleScreen.showUrl === 'function') {
        window.IminDoubleScreen.showUrl(url);
        console.log("✅ iMin Dual Screen: Proyectado exitosamente vía window.IminDoubleScreen.showUrl()");
        return true;
      }
    } catch (e) {
      console.error("Fallo en window.IminDoubleScreen:", e);
    }
  }

  // 2. Try window.Android generic wrapper injection
  if (window.Android) {
    try {
      if (typeof window.Android.showUrlOnSecondScreen === 'function') {
        window.Android.showUrlOnSecondScreen(url);
        console.log("✅ iMin Dual Screen: Proyectado exitosamente vía window.Android.showUrlOnSecondScreen()");
        return true;
      }
      if (typeof window.Android.openSecondaryScreen === 'function') {
        window.Android.openSecondaryScreen(url);
        console.log("✅ iMin Dual Screen: Proyectado exitosamente vía window.Android.openSecondaryScreen()");
        return true;
      }
    } catch (e) {
      console.error("Fallo en window.Android:", e);
    }
  }

  // 3. Try IminDoubleScreenBridge variation
  if (window.IminDoubleScreenBridge) {
    try {
      if (typeof window.IminDoubleScreenBridge.showUrl === 'function') {
        window.IminDoubleScreenBridge.showUrl(url);
        console.log("✅ iMin Dual Screen: Proyectado exitosamente vía window.IminDoubleScreenBridge.showUrl()");
        return true;
      }
    } catch (e) {
      console.error("Fallo en window.IminDoubleScreenBridge:", e);
    }
  }

  // 4. Try sending direct display command via iMin local print daemon (if display service is running locally on port 13911)
  try {
    fetch('http://127.0.0.1:13911/display', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: url })
    }).then(res => {
      if (res.ok) {
        console.log("✅ iMin Dual Screen: Proyectado exitosamente vía local daemon /display");
      }
    }).catch(() => {});
  } catch (e) {}

  console.warn("⚠️ No se detectó puente de doble pantalla de iMin. Abriendo ventana secundaria del navegador.");
  return false;
}
