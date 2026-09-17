export class HUD {
  private root: HTMLDivElement;
  private healthFill: HTMLDivElement;
  private healthText: HTMLSpanElement;
  private hungerFill: HTMLDivElement;
  private energyFill: HTMLDivElement;
  private moneyEl: HTMLSpanElement;
  private clockEl: HTMLSpanElement;
  private starsEl: HTMLDivElement;
  private speedEl: HTMLDivElement;
  private hintEl: HTMLDivElement;
  private missionEl: HTMLDivElement;
  private overlay: HTMLDivElement;
  private deathOverlay: HTMLDivElement;
  private onRestart: (() => void) | null = null;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.id = 'hud';
    this.root.innerHTML = `
      <style>
        #hud {
          position: fixed; inset: 0; pointer-events: none;
          font-family: 'Segoe UI', system-ui, sans-serif; color: #fff;
          text-shadow: 0 1px 3px #000;
        }
        #hud .top-left { position: absolute; top: 16px; left: 16px; }
        #hud .top-right { position: absolute; top: 16px; right: 16px; text-align: right; }
        #hud .bottom { position: absolute; bottom: 20px; left: 50%; transform: translateX(-50%);
          background: rgba(0,0,0,0.45); padding: 8px 16px; border-radius: 8px;
          font-size: 13px; letter-spacing: 0.02em; max-width: 90vw; text-align: center; }
        #hud .mission { position: absolute; top: 16px; left: 50%; transform: translateX(-50%);
          background: rgba(0,0,0,0.55); padding: 10px 18px; border-radius: 8px;
          border: 1px solid rgba(255,200,50,0.5); font-size: 14px; max-width: 80vw; text-align: center; }
        #hud .bar {
          width: 160px; height: 12px; background: rgba(0,0,0,0.5);
          border: 1px solid rgba(255,255,255,0.3); border-radius: 4px; overflow: hidden; margin-top: 3px;
        }
        #hud .bar > div { height: 100%; width: 100%; transition: width 0.15s; }
        #hud #health-fill { background: linear-gradient(90deg, #c0392b, #e74c3c); }
        #hud #hunger-fill { background: linear-gradient(90deg, #d35400, #f39c12); }
        #hud #energy-fill { background: linear-gradient(90deg, #1a7a4c, #2ecc71); }
        #hud .stars { font-size: 22px; letter-spacing: 4px; color: #ffd700; min-height: 28px; }
        #hud .speed { font-size: 28px; font-weight: 700; font-variant-numeric: tabular-nums; }
        #hud .speed small { font-size: 14px; font-weight: 400; opacity: 0.8; }
        #hud .label { font-size: 11px; text-transform: uppercase; opacity: 0.7; letter-spacing: 0.08em; }
        #hud .stat-row { margin-top: 10px; }
        #hud .money { font-size: 22px; font-weight: 700; color: #7dffa0; font-variant-numeric: tabular-nums; }
        #hud .clock { font-size: 20px; font-weight: 600; font-variant-numeric: tabular-nums; margin-top: 8px; }
        #start-overlay, #death-overlay {
          position: fixed; inset: 0; background: rgba(8,10,20,0.85);
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          pointer-events: auto; z-index: 10;
        }
        #start-overlay { cursor: pointer; }
        #start-overlay h1, #death-overlay h1 {
          font-size: 48px; margin-bottom: 8px;
          background: linear-gradient(135deg, #ff6b35, #f7c948);
          -webkit-background-clip: text; -webkit-text-fill-color: transparent;
          background-clip: text;
        }
        #death-overlay h1 {
          background: linear-gradient(135deg, #ff3355, #ff8844);
          -webkit-background-clip: text; -webkit-text-fill-color: transparent;
          background-clip: text;
        }
        #start-overlay p, #death-overlay p { color: #ccc; margin: 4px 0; font-size: 15px; }
        #start-overlay .cta, #death-overlay .cta {
          margin-top: 24px; padding: 12px 28px; border: 2px solid #f7c948;
          border-radius: 8px; color: #f7c948; font-size: 16px; cursor: pointer;
          pointer-events: auto; background: transparent;
        }
        #death-overlay { display: none; }
        #death-overlay .cta:hover { background: rgba(247,201,72,0.15); }
      </style>
      <div class="top-left">
        <div class="label">Salomatlik</div>
        <div class="bar"><div id="health-fill"></div></div>
        <div style="margin-top:4px;font-size:13px"><span id="health-text">100</span> HP</div>
        <div class="stat-row">
          <div class="label">Ochlik</div>
          <div class="bar"><div id="hunger-fill"></div></div>
        </div>
        <div class="stat-row">
          <div class="label">Energiya</div>
          <div class="bar"><div id="energy-fill"></div></div>
        </div>
        <div class="label" style="margin-top:12px">Wanted</div>
        <div class="stars" id="stars"></div>
      </div>
      <div class="top-right">
        <div class="label">Pul</div>
        <div class="money">$<span id="money">500</span></div>
        <div class="label" style="margin-top:10px">Soat</div>
        <div class="clock" id="clock">12:00</div>
        <div class="speed" id="speed" style="display:none;margin-top:12px">0 <small>km/h</small></div>
      </div>
      <div class="mission" id="mission"></div>
      <div class="bottom" id="hint"></div>
      <div id="start-overlay">
        <h1>Street Pulse</h1>
        <p>Mini open-world · walk, drive, escape the heat</p>
        <p style="margin-top:16px;opacity:0.8">WASD · Sichqoncha · Space sakrash · Shift yugurish</p>
        <p style="opacity:0.8">E mashina · F ovqat (−$15) · R dam olish</p>
        <div class="cta">Click to play</div>
      </div>
      <div id="death-overlay">
        <h1>Halok bo'ldingiz</h1>
        <p>Pul saqlanadi. Salomatlik, ochlik, energiya va missiya qayta boshlanadi.</p>
        <button type="button" class="cta" id="restart-btn">Qayta boshlash</button>
      </div>
    `;
    parent.appendChild(this.root);
    this.healthFill = this.root.querySelector('#health-fill')!;
    this.healthText = this.root.querySelector('#health-text')!;
    this.hungerFill = this.root.querySelector('#hunger-fill')!;
    this.energyFill = this.root.querySelector('#energy-fill')!;
    this.moneyEl = this.root.querySelector('#money')!;
    this.clockEl = this.root.querySelector('#clock')!;
    this.starsEl = this.root.querySelector('#stars')!;
    this.speedEl = this.root.querySelector('#speed')!;
    this.hintEl = this.root.querySelector('#hint')!;
    this.missionEl = this.root.querySelector('#mission')!;
    this.overlay = this.root.querySelector('#start-overlay')!;
    this.deathOverlay = this.root.querySelector('#death-overlay')!;

    const btn = this.root.querySelector('#restart-btn')!;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.onRestart?.();
    });
  }

  setRestartHandler(fn: () => void): void {
    this.onRestart = fn;
  }

  hideOverlay(): void {
    this.overlay.style.display = 'none';
  }

  showDeath(): void {
    this.deathOverlay.style.display = 'flex';
  }

  hideDeath(): void {
    this.deathOverlay.style.display = 'none';
  }

  update(opts: {
    health: number;
    hunger: number;
    energy: number;
    money: number;
    clock: string;
    stars: number;
    speedKmh: number | null;
    hint: string;
    mission: string;
  }): void {
    this.healthFill.style.width = `${Math.max(0, Math.min(100, opts.health))}%`;
    this.healthText.textContent = String(Math.round(opts.health));
    this.hungerFill.style.width = `${Math.max(0, Math.min(100, opts.hunger))}%`;
    this.energyFill.style.width = `${Math.max(0, Math.min(100, opts.energy))}%`;
    this.moneyEl.textContent = String(Math.round(opts.money));
    this.clockEl.textContent = opts.clock;
    this.starsEl.textContent =
      opts.stars > 0 ? '★'.repeat(opts.stars) + '☆'.repeat(3 - opts.stars) : '';
    if (opts.speedKmh !== null) {
      this.speedEl.style.display = 'block';
      this.speedEl.innerHTML = `${Math.round(opts.speedKmh)} <small>km/h</small>`;
    } else {
      this.speedEl.style.display = 'none';
    }
    this.hintEl.textContent = opts.hint;
    this.missionEl.textContent = opts.mission;
  }
}
