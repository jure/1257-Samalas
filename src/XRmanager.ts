export default class VRSessionManager {
  currentSession: XRSession | null;
  renderer: THREE.WebGLRenderer;

  constructor(renderer: THREE.WebGLRenderer) {
    this.renderer = renderer;
    this.currentSession = null;
  }

  async startSession() {
    if (this.currentSession === null) {
      console.log("NO CURRENT SESSION");
      const sessionInit = {
        optionalFeatures: ["local-floor", "bounded-floor", "hand-tracking", "layers"],
      };
      try {
        if (!navigator.xr) {
          throw new Error("WebXR not supported");
        }
        const session = await navigator.xr.requestSession("immersive-vr", sessionInit);
        session.addEventListener("end", () => this.endSession());
        await this.renderer.xr.setSession(session);
        this.currentSession = session;
        console.log("Started VR session", session);
      } catch (error) {
        console.error("Failed to start VR session:", error);
      }
    } else {
      console.log("ENDING SESSION");
      this.currentSession.end();
    }
  }

  endSession() {
    if (this.currentSession) {
      this.currentSession.removeEventListener("end", this.endSession);
      this.currentSession = null;
    }
  }
}
