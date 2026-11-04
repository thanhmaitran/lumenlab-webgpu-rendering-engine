export function UnsupportedNotice(props: { code: string; reason: string }) {
  return (
    <div
      className="viewport__overlay viewport__overlay--error"
      role="alert"
      data-testid="unsupported-notice"
    >
      <h2>WebGPU is not available</h2>
      <p>{props.reason}</p>
      <p className="muted">
        LumenLab renders exclusively through WebGPU and intentionally does <strong>not</strong> fall
        back to WebGL or another 3D library, so nothing is drawn here.
      </p>
      <ul className="hints">
        <li>Use a recent desktop Chrome or Edge (113+), or another browser with WebGPU enabled.</li>
        <li>Open the page over HTTPS or from localhost; WebGPU requires a secure context.</li>
        <li>Update your GPU driver and check chrome://gpu for the WebGPU status.</li>
      </ul>
      <p className="mono muted">code: {props.code}</p>
    </div>
  );
}
