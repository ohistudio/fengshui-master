// FengshuiCamera.ts — CameraModule still-capture helper.
// Uses the continuous camera stream (works in editor with Default_Color and on device),
// waits one frame so the texture is rendered, then JPEG-encodes via Base64.encodeTextureAsync.
// Resolution is kept modest (editor 352 / device 756 smaller-dimension) so uploads stay fast.

export class FengshuiCameraService {
  private cameraModule: CameraModule = require("LensStudio:CameraModule")
  private camTex: Texture | null = null
  private provider: CameraTextureProvider | null = null

  // Call from an OnStartEvent handler — never from onAwake (camera lifecycle rule).
  start(): void {
    if (this.camTex) return
    const req = CameraModule.createCameraRequest()
    // Default_Color everywhere: SPECS 27 has no left COLOR camera, and DepthCache's
    // color->depth remap tolerates the stereo baseline at room distances.
    req.cameraId = CameraModule.CameraId.Default_Color
    req.imageSmallerDimension = global.deviceInfoSystem.isEditor() ? 352 : 756
    this.camTex = this.cameraModule.requestCamera(req)
    this.provider = this.camTex.control as CameraTextureProvider
    this.provider.onNewFrame.add(() => {}) // keep the pipeline warm
  }

  async captureJpegBase64(): Promise<string> {
    this.start()
    await this.nextFrame() // texture is not rendered until at least one frame arrives
    return new Promise<string>((resolve, reject) => {
      Base64.encodeTextureAsync(
        this.camTex!,
        (s) => resolve(s),
        () => reject(new Error("camera texture encode failed")),
        CompressionQuality.HighQuality,
        EncodingType.Jpg
      )
    })
  }

  private nextFrame(): Promise<void> {
    return new Promise<void>((resolve) => {
      const reg = this.provider!.onNewFrame.add(() => {
        this.provider!.onNewFrame.remove(reg)
        resolve()
      })
    })
  }
}
