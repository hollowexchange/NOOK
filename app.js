(() => {
  const windInput = document.getElementById("windStrength");
  const tempInput = document.getElementById("temperature");
  const windValue = document.getElementById("windValue");
  const tempValue = document.getElementById("tempValue");
  const readout = document.getElementById("readout");
  const linkStatus = document.getElementById("linkStatus");
  const linkStatusText = document.getElementById("linkStatusText");
  const acTemp = document.getElementById("acTemp");
  const root = document.documentElement;
  const canvas = document.getElementById("wind");
  const ctx = canvas.getContext("2d");

  const cfg = window.GALE_MQTT || {
    url: "wss://broker.hivemq.com:8884/mqtt",
    clientIdPrefix: "gale-web-",
    topics: {
      command: "aawdwdookpodk-4",
      state: "aawdwdookpodk-4/state",
    },
  };

  let wind = Number(windInput.value);
  let temp = Number(tempInput.value);
  let particles = [];
  let width = 0;
  let height = 0;
  let dpr = 1;
  let mqttClient = null;
  let applyingRemote = false;
  let deviceSeen = false;

  const fanLabels = ["Off", "1", "2", "3", "4", "5"];

  function windNorm() {
    return wind / 5;
  }

  function setLinkStatus(kind, text) {
    linkStatus.classList.remove("is-online", "is-offline");
    if (kind) linkStatus.classList.add(kind);
    linkStatusText.textContent = text;
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    rebuildParticles();
  }

  function particleCount() {
    return wind === 0 ? 0 : Math.round(6 + windNorm() * 30);
  }

  function outletPosition() {
    const outlet = document.querySelector(".ac-outlet");
    const rect = outlet.getBoundingClientRect();
    return {
      x: rect.left + rect.width * 0.5,
      left: rect.left + rect.width * 0.06,
      right: rect.right - rect.width * 0.06,
      y: rect.bottom - 2,
    };
  }

  function makeParticle(atOutlet = false) {
    const n = windNorm();
    const outlet = outletPosition();
    const travel = atOutlet ? Math.random() * 18 : Math.random() * Math.min(width * 0.5, 520);
    const originT = Math.random();
    const offsetFromMiddle = (originT - 0.5) * 2;
    const distanceFromMiddle = Math.abs(offsetFromMiddle);
    const horizontal = offsetFromMiddle * (0.82 + Math.random() * 0.16)
      + (Math.random() - 0.5) * 0.04;
    const drop = 1.05 - distanceFromMiddle * 0.34 + Math.random() * 0.06;
    const originX = outlet.left + originT * (outlet.right - outlet.left);
    return {
      x: originX + travel * horizontal,
      y: outlet.y + travel * drop,
      len: 12 + Math.random() * (10 + n * 14),
      speed: 0.45 + n * 3.2 + Math.random() * 0.65,
      alpha: 0.18 + Math.random() * 0.26,
      horizontal,
      drop,
      drift: (Math.random() - 0.5) * 0.14,
    };
  }

  function rebuildParticles() {
    particles = Array.from({ length: particleCount() }, makeParticle);
  }

  function windLabel(w) {
    if (w === 0) return "Still air";
    if (w === 1) return "A quiet hush of air";
    if (w === 2) return "A soft current";
    if (w === 3) return "A steady stream";
    if (w === 4) return "A brisk flow";
    return "A strong rush of air";
  }

  function tempLabel(t) {
    if (t <= 18) return "in crisp cool air";
    if (t <= 22) return "in easy cool air";
    if (t <= 26) return "in mild comfort";
    return "in gentle warmth";
  }

  function lerpColor(a, b, t) {
    const parse = (hex) => [
      parseInt(hex.slice(1, 3), 16),
      parseInt(hex.slice(3, 5), 16),
      parseInt(hex.slice(5, 7), 16),
    ];
    const ca = parse(a);
    const cb = parse(b);
    const mix = ca.map((c, i) => Math.round(c + (cb[i] - c) * t));
    return `#${mix.map((n) => n.toString(16).padStart(2, "0")).join("")}`;
  }

  function applyAtmosphere() {
    const tNorm = (temp - 16) / 14;
    const coolTop = "#6a9bb8";
    const midTop = "#8bb8cc";
    const warmTop = "#c9a882";
    const coolMid = "#b4d0dc";
    const midMid = "#c8dce4";
    const warmMid = "#e6d4bc";
    const coolBot = "#dce8e6";
    const midBot = "#e6eee8";
    const warmBot = "#f0e6d8";
    const coolSun = "#dce8f5";
    const midSun = "#f0d9a8";
    const warmSun = "#e8b070";
    const coolGrass = "#457060";
    const midGrass = "#3d6b4f";
    const warmGrass = "#5c6e42";

    let skyTop;
    let skyMid;
    let skyBot;
    let sun;
    let grass;

    if (tNorm < 0.5) {
      const u = tNorm / 0.5;
      skyTop = lerpColor(coolTop, midTop, u);
      skyMid = lerpColor(coolMid, midMid, u);
      skyBot = lerpColor(coolBot, midBot, u);
      sun = lerpColor(coolSun, midSun, u);
      grass = lerpColor(coolGrass, midGrass, u);
    } else {
      const u = (tNorm - 0.5) / 0.5;
      skyTop = lerpColor(midTop, warmTop, u);
      skyMid = lerpColor(midMid, warmMid, u);
      skyBot = lerpColor(midBot, warmBot, u);
      sun = lerpColor(midSun, warmSun, u);
      grass = lerpColor(midGrass, warmGrass, u);
    }

    const n = windNorm();
    root.style.setProperty("--sky-top", skyTop);
    root.style.setProperty("--sky-mid", skyMid);
    root.style.setProperty("--sky-bot", skyBot);
    root.style.setProperty("--sun", sun);
    root.style.setProperty("--grass", grass);
    root.style.setProperty("--sway", `${n * 1.4}deg`);
    root.style.setProperty("--wind-speed", String(wind));

    const haze = document.getElementById("haze");
    haze.style.opacity = String(0.22 + Math.max(0, (temp - 22) / 16) * 0.35);

    windValue.textContent = fanLabels[wind];
    tempValue.textContent = `${temp} °C`;
    acTemp.textContent = `${temp}°`;
    windInput.setAttribute("aria-valuenow", String(wind));
    tempInput.setAttribute("aria-valuenow", String(temp));
    readout.textContent = `${windLabel(wind)} ${tempLabel(temp)}.`;
  }

  function publishComfort() {
    if (!mqttClient || !mqttClient.connected || applyingRemote) return;
    const power = wind > 0 ? 1 : 0;
    mqttClient.publish(
      cfg.topics.command,
      `${power}/${wind}/${temp}`,
      { qos: 0, retain: false }
    );
  }

  function applyRemoteState(nextWind, nextTemp) {
    applyingRemote = true;
    if (Number.isFinite(nextWind) && nextWind !== wind) {
      wind = Math.max(0, Math.min(5, Math.round(nextWind)));
      windInput.value = String(wind);
      rebuildParticles();
    }
    if (Number.isFinite(nextTemp) && nextTemp !== temp) {
      temp = Math.max(16, Math.min(30, Math.round(nextTemp)));
      tempInput.value = String(temp);
    }
    applyAtmosphere();
    applyingRemote = false;
  }

  function connectMqtt() {
    if (typeof mqtt === "undefined") {
      setLinkStatus("is-offline", "MQTT library missing");
      return;
    }

    setLinkStatus("", "Linking…");
    const clientId = `${cfg.clientIdPrefix}${Math.random().toString(16).slice(2, 10)}`;

    mqttClient = mqtt.connect(cfg.url, {
      clientId,
      clean: true,
      reconnectPeriod: 2500,
      connectTimeout: 10000,
    });

    mqttClient.on("connect", () => {
      mqttClient.subscribe(cfg.topics.state);
      setLinkStatus(
        deviceSeen ? "is-online" : "",
        deviceSeen ? "Board linked" : "Broker linked · waiting for board"
      );
    });

    mqttClient.on("reconnect", () => {
      setLinkStatus("", "Relinking…");
    });

    mqttClient.on("close", () => {
      setLinkStatus("is-offline", "Broker offline");
    });

    mqttClient.on("error", () => {
      setLinkStatus("is-offline", "Broker unreachable");
    });

    mqttClient.on("message", (topic, payload) => {
      const text = payload.toString();

      if (topic === cfg.topics.state) {
        try {
          const state = JSON.parse(text);
          deviceSeen = Boolean(state.online);
          if (deviceSeen) {
            setLinkStatus("is-online", "Board linked");
          }
          applyRemoteState(Number(state.airflow), Number(state.temperature));
        } catch {
          /* ignore bad state payloads */
        }
        return;
      }

    });
  }

  function draw() {
    ctx.clearRect(0, 0, width, height);
    const boost = windNorm();
    for (const p of particles) {
      p.x += p.speed * p.horizontal * (0.35 + boost * 0.72);
      p.y += p.speed * p.drop * (0.32 + boost * 0.62)
        + p.drift
        + Math.sin((p.x + p.y) * 0.012) * 0.12;
      if (p.x < 24 || p.x > width - 24 || p.y > height * 0.82) {
        Object.assign(p, makeParticle(true));
      }
      ctx.strokeStyle = `rgba(73, 145, 163, ${p.alpha * (0.72 + boost * 0.28)})`;
      ctx.lineWidth = 1.15 + boost * 0.65;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.quadraticCurveTo(
        p.x - p.len * p.horizontal * 0.5,
        p.y - p.len * p.drop * 0.5,
        p.x - p.len * p.horizontal,
        p.y - p.len * p.drop
      );
      ctx.stroke();
    }
    requestAnimationFrame(draw);
  }

  windInput.addEventListener("input", () => {
    wind = Number(windInput.value);
    applyAtmosphere();
    rebuildParticles();
  });

  tempInput.addEventListener("input", () => {
    temp = Number(tempInput.value);
    applyAtmosphere();
  });

  windInput.addEventListener("pointerup", publishComfort);
  tempInput.addEventListener("pointerup", publishComfort);

  window.addEventListener("resize", resize);
  resize();
  applyAtmosphere();
  draw();
  connectMqtt();
})();
