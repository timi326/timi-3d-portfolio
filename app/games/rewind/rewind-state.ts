export type Point = { x: number; z: number };
export type EchoFrame = Point & { t: number; yaw: number };
export const STATIONS = { vase: { x: -2.9, z: -2.7 }, bridge: { x: 1.5, z: -2.8 }, plate: { x: -3.2, z: 1.65 }, door: { x: 4.25, z: 1.7 } };
export const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.z - b.z);

/** Deterministic simulation. No renderer or wall-clock dependency. */
export class RewindState {
  stage = 0;
  elapsed = 0;
  vase = 1;
  bridge = 1;
  cart = -1.25;
  cartRunning = false;
  cartFall = 0;
  failures = 0;
  recording = false;
  recordTime = 0;
  frames: EchoFrame[] = [];
  echoTime = 0;
  echo: EchoFrame | null = null;
  doorPowered = false;
  message = '这间房间的时间停在了日落前。先去左侧的碎花瓶旁。';

  interact(player: Point) {
    if (this.stage === 0 && distance(player, STATIONS.vase) < 2.2) {
      if (this.vase > .03) this.message = '按住 R，让碎片回到破碎之前。';
      else { this.stage = 1; this.message = '取得发条钥匙。去右侧的轨道桌，按 E 启动小车。'; }
    } else if (this.stage === 1 && distance(player, STATIONS.bridge) < 2.45) {
      this.cart = -1.25; this.cartFall = 0; this.cartRunning = true;
      this.message = '小车开始前进。按住 R 恢复断桥，让它安全通过。';
    } else if (this.stage === 2 && distance(player, STATIONS.door) < 1.85) {
      if (this.doorPowered) { this.stage = 3; this.message = '你走出了房间。时间，又开始流动了。'; }
      else this.message = '出口需要有人一直踩住左侧地面的光圈。试试让回声替你留下。';
    }
  }

  toggleRecording(player: Point, yaw: number) {
    if (this.stage !== 2) return;
    if (this.recording) {
      if (this.recordTime < .4) { this.message = '至少记录一小段行动，再按 Q 结束。'; return; }
      this.frames.push({ ...player, yaw, t: this.recordTime });
      this.recording = false; this.echoTime = 0;
      this.message = '回声开始重演，并会停在最后的位置。让它踩住光圈，再去出口。';
    } else {
      this.recording = true; this.recordTime = 0; this.echo = null; this.doorPowered = false;
      this.frames = [{ ...player, yaw, t: 0 }];
      this.message = '正在记录。走上左侧光圈，停下后按 Q，让回声留在那里。';
    }
  }

  update(dt: number, player: Point, yaw: number, rewind: boolean) {
    if (this.stage === 3) return;
    dt = Math.max(0, Math.min(dt, .05));
    this.elapsed += dt;
    if (this.stage === 0) {
      const active = rewind && distance(player, STATIONS.vase) < 2.2;
      this.vase = Math.max(0, Math.min(1, this.vase + dt * (active ? -.42 : .13)));
      if (active && this.vase <= .03) this.message = '花瓶恢复了，钥匙浮出瓶口。保持 R，按 E 取走钥匙。';
    }
    if (this.stage === 1) {
      this.bridge = Math.max(0, Math.min(1, this.bridge + dt * (rewind && distance(player, STATIONS.bridge) < 2.45 ? -.85 : .2)));
      if (this.cartFall > 0) {
        this.cartFall += dt;
        if (this.cartFall > 1.1) { this.cartFall = 0; this.cart = -1.25; }
      } else if (this.cartRunning) {
        this.cart += dt * .3;
        if (this.cart > -.65 && this.cart < .7 && this.bridge > .22) {
          this.cartRunning = false; this.cartFall = .001; this.failures++;
          this.message = '桥还没有恢复，小车掉下去了。按 E 重试，提前按住 R。';
        } else if (this.cart >= 1.25) {
          this.cartRunning = false; this.stage = 2;
          this.message = '回声装置已通电。按 Q 记录行动，走上左侧光圈，再按 Q 留下回声。';
        }
      }
    }
    if (this.stage === 2) {
      if (this.recording) {
        this.recordTime = Math.min(8, this.recordTime + dt);
        const last = this.frames[this.frames.length - 1];
        if (this.recordTime - last.t >= .05) this.frames.push({ ...player, yaw, t: this.recordTime });
        if (this.recordTime >= 8) this.toggleRecording(player, yaw);
      } else if (this.frames.length > 1) {
        this.echoTime = Math.min(this.recordTime, this.echoTime + dt);
        const next = this.frames.findIndex(frame => frame.t >= this.echoTime);
        const b = this.frames[next < 0 ? this.frames.length - 1 : next];
        const a = this.frames[Math.max(0, next - 1)];
        const mix = Math.max(0, Math.min(1, (this.echoTime - a.t) / Math.max(.001, b.t - a.t)));
        this.echo = { x: a.x + (b.x - a.x) * mix, z: a.z + (b.z - a.z) * mix, yaw: a.yaw, t: this.echoTime };
      }
      this.doorPowered = !!this.echo && distance(this.echo, STATIONS.plate) < .8;
    }
  }
}
