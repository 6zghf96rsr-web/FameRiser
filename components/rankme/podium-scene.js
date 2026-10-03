import * as T from "three";
import { observePodiumSize } from "./podium-resize.js";

// Geometry and materials ported from the approved Afterglow reference. The React
// overlay owns profile content, navigation and accessibility; this is decorative.
export function mountPodium({ host, surface, cards, people, motion, onReady }) {
  const state = { lime: '#bdeb6d', purple: '#6d2d91', gold: '#f0cf87', depth: .8, motion, turn: 0 };
  const scene = new T.Scene(), world = new T.Group(); scene.add(world);
  let renderer;
  try { renderer = new T.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' }); }
  catch { onReady(false); return { dispose() {}, setMotion() {}, setTurn() {}, highlight() {} }; }
  renderer.setClearColor(0, 0); renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
  renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.12;
  renderer.domElement.setAttribute('aria-hidden', 'true'); host.append(renderer.domElement);
   const camera=new T.OrthographicCamera(-4.4,4.4,2,-2,.1,70),basePitch=-Math.atan(5/12);
   scene.add(new T.AmbientLight(0xe6dcec,.50));const key=new T.DirectionalLight(0xfff4dd,4.3);key.position.set(-3,7,6);key.castShadow=true;key.shadow.mapSize.set(1024,1024);Object.assign(key.shadow.camera,{left:-6,right:6,top:7,bottom:-5});key.shadow.normalBias=.025;scene.add(key);
   const fill=new T.DirectionalLight(0xd9e3ff,1.6);fill.position.set(4,3,4);scene.add(fill);const violet=new T.PointLight(0xaf7cf5,28,12);violet.position.set(-3.8,2.5,-1);scene.add(violet);const lime=new T.PointLight(state.lime,22,12);lime.position.set(4,2.5,.2);scene.add(lime);const sweep=new T.PointLight(0xffefc5,0,12);sweep.position.set(-4,4,3);scene.add(sweep);
   const envCanvas=document.createElement('canvas');envCanvas.width=1024;envCanvas.height=512;const ec=envCanvas.getContext('2d');ec.fillStyle='#100d16';ec.fillRect(0,0,1024,512);const eg=ec.createLinearGradient(0,0,0,512);eg.addColorStop(0,'#726d75');eg.addColorStop(.35,'#403848');eg.addColorStop(.6,'#120e18');eg.addColorStop(1,'#030204');ec.fillStyle=eg;ec.fillRect(0,0,1024,512);[[85,65,47,270,'#fff7df'],[180,90,12,220,'#ffffff'],[340,50,150,92,'#fffcf4'],[628,50,67,245,'#d8bdef'],[820,80,110,180,'#e6f4ce']].forEach(([x,y,w,h,c])=>{ec.fillStyle=c;ec.fillRect(x,y,w,h)});const front=ec.createLinearGradient(640,0,975,0);front.addColorStop(0,'#544650');front.addColorStop(.16,'#fffaf0');front.addColorStop(.30,'#c3bcb0');front.addColorStop(.56,'#faf1dc');front.addColorStop(.66,'#554350');front.addColorStop(.82,'#d5cdbf');front.addColorStop(1,'#29202d');ec.fillStyle=front;ec.fillRect(640,155,335,270);const envTex=new T.CanvasTexture(envCanvas);envTex.mapping=T.EquirectangularReflectionMapping;envTex.colorSpace=T.SRGBColorSpace;const pmrem=new T.PMREMGenerator(renderer),env=pmrem.fromEquirectangular(envTex);scene.environment=env.texture;envTex.dispose();pmrem.dispose();
   const metal=(color,rough=.22,m=.93)=>new T.MeshPhysicalMaterial({color,metalness:m,roughness:rough,clearcoat:.42,clearcoatRoughness:.18,envMapIntensity:1.35});
   const gold=metal(state.gold,.20,.88),black=metal('#211d27',.43,.55),purple=metal(state.purple,.19,.72),green=new T.MeshPhysicalMaterial({color:state.lime,metalness:.10,roughness:.32,clearcoat:.5,clearcoatRoughness:.25,envMapIntensity:.85}),darkGold=metal('#8f642c',.24,.96);
   function add(mesh,parent=world){parent.add(mesh);return mesh}
   const floor=new T.Group();floor.scale.z=.70;world.add(floor);function disk(rt,rb,h,y,mat){const mesh=add(new T.Mesh(new T.CylinderGeometry(rt,rb,h,128),mat),floor);mesh.position.y=y;mesh.receiveShadow=true;return mesh}
   disk(3.89,4.01,.10,-.19,black);disk(3.77,3.87,.055,-.11,metal('#1c1921',.34,.7));
   const lightMaterials=[];function glow(color,opacity=1){const mat=new T.MeshBasicMaterial({color,transparent:true,opacity,toneMapped:false,depthWrite:false});lightMaterials.push(mat);return mat}
   const baseRim=glow(state.lime,.68);[3.78,3.98].forEach((r,i)=>{const mesh=add(new T.Mesh(new T.TorusGeometry(r,i?.009:.014,6,128),i?glow('#9b6ec6',.4):baseRim),floor);mesh.rotation.x=Math.PI/2;mesh.position.y=-.12-i*.09});
   const shadowCanvas=document.createElement('canvas');shadowCanvas.width=shadowCanvas.height=128;const sc=shadowCanvas.getContext('2d'),sg=sc.createRadialGradient(64,64,6,64,64,64);sg.addColorStop(0,'#000000bb');sg.addColorStop(1,'#00000000');sc.fillStyle=sg;sc.fillRect(0,0,128,128);const shadowTex=new T.CanvasTexture(shadowCanvas);
   function contour(w,d,corner=.17){const s=new T.Shape(),a=w/2,b=d/2,c=corner;s.moveTo(-a+c,-b);s.lineTo(a-c,-b);s.lineTo(a,-b+c);s.lineTo(a,b-c);s.lineTo(a-c,b);s.lineTo(-a+c,b);s.lineTo(-a,b-c);s.lineTo(-a,-b+c);s.closePath();return s}
   function sculpt(w,h,d,mat,taper=.10){const geo=new T.ExtrudeGeometry(contour(w,d),{depth:h,bevelEnabled:true,bevelSize:.052,bevelThickness:.045,bevelSegments:3,steps:8});geo.rotateX(-Math.PI/2);const a=geo.attributes.position;for(let n=0;n<a.count;n++){const t=Math.max(0,Math.min(1,a.getY(n)/h)),s=1+taper*(1-t);a.setX(n,a.getX(n)*s);a.setZ(n,a.getZ(n)*s)}a.needsUpdate=true;geo.computeVertexNormals();const mesh=new T.Mesh(geo,mat);mesh.castShadow=true;mesh.receiveShadow=true;return mesh}
   function outline(w,d,y,mat,x=0){const pts=contour(w,d).getPoints(1).map(p=>new T.Vector3(p.x+x,y,-p.y));const g=new T.BufferGeometry().setFromPoints(pts);const line=add(new T.LineLoop(g,mat));return line}
   const pedestals=[{x:-2.13,h:1.02,mat:purple,accent:'#b995db',rank:'02'},{x:0,h:1.68,mat:gold,accent:'#f9e5af',rank:'01'},{x:2.13,h:.82,mat:green,accent:state.lime,rank:'03'}];
   const medals=[],ranks=[],accentMats=[],capLights=[];
   pedestals.forEach((p,i)=>{
    p.rank = people[i] ? String(people[i].rank).padStart(2, "0") : "—";
    const shadow=add(new T.Mesh(new T.PlaneGeometry(2.9,2.65),new T.MeshBasicMaterial({map:shadowTex,transparent:true,depthWrite:false})));shadow.rotation.x=-Math.PI/2;shadow.position.set(p.x,-.055,0);
    const foot=add(sculpt(1.90,.10,1.75,black,.015));foot.position.set(p.x,.02,0);const column=add(sculpt(1.66,p.h,1.42,p.mat,.13));column.position.set(p.x,.17,0);
    const neck=add(sculpt(1.34,.10,1.10,black,0));neck.position.set(p.x,p.h+.18,0);
    const top=add(sculpt(1.67,.055,1.43,p.mat,0));top.position.set(p.x,p.h+.32,0);const a=new T.LineBasicMaterial({color:p.accent,transparent:true,opacity:.8,toneMapped:false});outline(1.70,1.46,p.h+.422,a,p.x);accentMats.push(a);
    const inset=add(sculpt(1.29,.018,1.07,i===1?darkGold:black,0));inset.position.set(p.x,p.h+.417,0);
    const capLight=add(new T.Mesh(new T.BoxGeometry(1.53,.022,.018),glow(p.accent,.72)));capLight.position.set(p.x,p.h+.25,.76);capLights.push(capLight.material);
    const strip=add(new T.Mesh(new T.BoxGeometry(1.53,.024,.018),glow(i===1?'#fae9bb':p.accent,.75)));strip.position.set(p.x,.26,.81);accentMats.push(strip.material);
    const lc=document.createElement('canvas');lc.width=256;lc.height=256;const ctx=lc.getContext('2d');ctx.font='600 146px "Barlow Condensed",sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle=i===1?'#3b270d':i===2?'#2c381e':'#eadff2';ctx.fillText(p.rank,128,140);const tex=new T.CanvasTexture(lc);tex.colorSpace=T.SRGBColorSpace;const rank=add(new T.Mesh(new T.PlaneGeometry(.68,.68),new T.MeshBasicMaterial({map:tex,transparent:true,depthWrite:false})));rank.position.set(p.x,.18+p.h*.49,.895);ranks.push(rank);
    const medal=new T.Group();world.add(medal);medal.rotation.x=basePitch;const radius=i===1?.65:.55,ringMat=i===1?gold:metal(i===0?'#b7a0c7':state.lime,.19,i===0?.94:.65);
    const body=new T.Mesh(new T.CylinderGeometry(radius,radius,.14,80),i===1?darkGold:black);body.rotation.x=Math.PI/2;body.castShadow=true;medal.add(body);
    const outer=new T.Mesh(new T.TorusGeometry(radius-.018,.044,10,96),ringMat);outer.position.z=.082;medal.add(outer);const inside=new T.Mesh(new T.TorusGeometry(radius-.080,.010,6,96),i===1?gold:glow(p.accent,.75));inside.position.z=.105;medal.add(inside);
    const face=new T.Mesh(new T.CircleGeometry(radius-.087,80),new T.MeshBasicMaterial({color:'#21192b',toneMapped:false}));face.position.z=.085;medal.add(face);
    const lens=new T.Mesh(new T.CircleGeometry(radius-.082,80),new T.MeshPhysicalMaterial({color:'#ffffff',metalness:.05,roughness:.17,transparent:true,opacity:.075,clearcoat:1,clearcoatRoughness:.10,depthWrite:false}));lens.position.z=.095;medal.add(lens);
    for(let k=0;k<32;k++){const angle=k/32*Math.PI*2;const notch=new T.Mesh(new T.BoxGeometry(.006,.025,.012),ringMat);notch.position.set(Math.sin(angle)*(radius-.024),Math.cos(angle)*(radius-.024),.116);notch.rotation.z=-angle;medal.add(notch)}
    const anchor=new T.Object3D();medal.add(anchor);const haloMat=glow(i===1?'#efcd88':p.accent,.10),halo=new T.Mesh(new T.RingGeometry(radius+.042,radius+.052,96),haloMat);halo.position.z=-.03;medal.add(halo);
    medals.push({group:medal,face,anchor,radius,ringMat,innerMat:inside.material,scale:1,y:0,hover:0,target:0,haloMat,id:people[i]?.id??-1,changed:0});
   });
   const crown=new T.Group();medals[1].group.add(crown);crown.position.set(0,.71,0);crown.rotation.y=-.10;
   const crownBand=new T.Mesh(new T.CylinderGeometry(.22,.18,.055,48,1,true),gold);crownBand.rotation.x=Math.PI/2;crown.add(crownBand);
   const cs=new T.Shape();cs.moveTo(-.22,0);cs.lineTo(.22,0);cs.lineTo(.27,.25);cs.lineTo(.10,.16);cs.lineTo(0,.34);cs.lineTo(-.10,.16);cs.lineTo(-.27,.25);cs.closePath();const cm=new T.Mesh(new T.ExtrudeGeometry(cs,{depth:.06,bevelEnabled:true,bevelSize:.016,bevelThickness:.015,bevelSegments:3}),gold);cm.position.set(0,0,.06);crown.add(cm);[-1,0,1].forEach(n=>{const gem=new T.Mesh(new T.SphereGeometry(.027,12,8),gold);gem.position.set(n*.265,n===0?.34:.25,.09);crown.add(gem)});

  crown.visible = people[1]?.rank === 1;
  medals.forEach((m, i) => { m.group.visible = !!people[i]; ranks[i].visible = !!people[i]; });
  let alive = true, visible = true, frame = 0, px = 0, py = 0, targetX = 0, targetY = 0;
  let start = performance.now(), intro = state.motion, last = performance.now();
  const point = new T.Vector3();
  const sizes = observePodiumSize([host, ...cards.flatMap(card => [card?.querySelector('.signature-label'),card?.querySelector('.podium-visit')])], resize);
  let renderedWidth = 0, renderedHeight = 0;
  const intersectionObserver = new IntersectionObserver(entries => {
    visible = entries[0].isIntersecting;
    if (visible) { last = performance.now(); request(); }
    else { cancelAnimationFrame(frame); frame = 0; }
  }, { rootMargin: '150px' });
  function positionLabels() {
    world.updateMatrixWorld(true);
    const w = host.clientWidth, h = host.clientHeight;
    medals.forEach((m, i) => {
      const card = cards[i]; if (!card) return;
      m.anchor.getWorldPosition(point); point.project(camera);
      const diameter = m.radius * 2 * m.scale * w / 8.8;
      card.style.left = ((point.x + 1) * w / 2) + 'px';
      card.style.top = ((1 - point.y) * h / 2 - diameter / 2) + 'px';
      card.style.setProperty('--medal-size', diameter + 'px');
    });
  }
  function request() { if (alive && visible && !document.hidden && !frame) frame = requestAnimationFrame(tick); }
  function tick(now) {
    frame = 0; if (!alive) return;
    const dt = Math.min(40, now - last); last = now;
    const s = state.motion ? 1 - Math.pow(.86, dt / 16.67) : 1;
    const t = intro && state.motion ? Math.min(1, (now - start) / 1150) : 1;
    const ease = 1 - Math.pow(1 - t, 3);
    world.rotation.y += (targetY - world.rotation.y) * s;
    world.rotation.x += (targetX - world.rotation.x) * s;
    world.position.y = -.18 * (1 - ease);
    key.intensity = 3.2 + 1.1 * ease;
    sweep.position.x = -4 + 8 * t; sweep.intensity = t < 1 ? Math.sin(t * Math.PI) * 18 : 0;
    intro = t < 1;
    let unsettled = intro;
    medals.forEach((m, i) => {
      m.hover += (m.target - m.hover) * s;
      m.group.position.set(pedestals[i].x, m.y + m.hover * .09 * state.depth, .08 + m.hover * .11 * state.depth);
      m.group.rotation.y = m.hover * .12 * state.depth;
      m.group.rotation.x = basePitch - m.hover * .055 * state.depth;
      m.group.scale.setScalar(m.scale); m.haloMat.opacity = .08 + m.hover * .28;
      if (Math.abs(m.hover - m.target) > .004) unsettled = true;
    });
    renderer.render(scene, camera); positionLabels();
    if (unsettled || Math.abs(world.rotation.y - targetY) + Math.abs(world.rotation.x - targetX) > .0004) request();
  }
  function refresh() {
    targetY = state.turn + (state.motion ? px * .12 * state.depth : 0);
    targetX = state.motion ? py * .027 * state.depth : 0; request();
  }
  function resize() {
    if (!alive) return;
    const w = host.clientWidth; if (!w) return;
    const bottom = w < 600 ? 50 : w / 8.8 * 1.30;
    let requiredHeight = 0;
    medals.forEach((m, i) => {
      m.scale = Math.max(1, 430 / w);
      const labelHeight = (cards[i]?.querySelector('.signature-label')?.getBoundingClientRect().height || 85) + (cards[i]?.querySelector('.podium-visit')?.getBoundingClientRect().height || 0) + 8;
      const labelGap = Math.max(w < 600 ? 130 : 145, labelHeight + 48) * 8.8 / w / Math.cos(basePitch);
      m.y = pedestals[i].h + .36 + labelGap + m.radius * m.scale / Math.cos(basePitch);
      if (!people[i]) return;
      // The medal faces the camera, so its crown/rim height is already in
      // camera space. Reserve room above it for hover, tilt and focus outlines.
      const topExtent = i === 1 && crown.visible ? 1.11 : m.radius + .055;
      const top = Math.cos(basePitch) * m.y - Math.sin(basePitch) * .08 + topExtent * m.scale;
      requiredHeight = Math.max(requiredHeight, bottom + top * w / 8.8 + (w < 600 ? 12 : 40));
    });
    // Keep the approved CSS height as a floor, growing the entire scene rather
    // than clipping the crown or detaching the HTML portrait from its 3D ring.
    const minHeight = Math.ceil(requiredHeight) + 'px';
    if (surface.style.minHeight !== minHeight) surface.style.minHeight = minHeight;
    const h = host.clientHeight; if (!h) return;
    if (w !== renderedWidth || h !== renderedHeight) { renderer.setSize(w, h, false); renderedWidth = w; renderedHeight = h; }
    const half = 4.4 * h / w;
    camera.left = -4.4; camera.right = 4.4; camera.top = half; camera.bottom = -half;
    const aim = (half - bottom * 8.8 / w) / Math.cos(basePitch);
    camera.position.set(0, aim + 5, 12); camera.lookAt(0, aim, 0); camera.updateProjectionMatrix();
    refresh();
  }
  function move(e) {
    if (e.pointerType === 'touch' || !state.motion) return;
    const b = surface.getBoundingClientRect();
    px = ((e.clientX - b.left) / b.width - .5) * 2;
    py = ((e.clientY - b.top) / b.height - .5) * 2; refresh();
  }
  function leave() { px = 0; py = 0; refresh(); }
  function visibility() { if (document.hidden) { cancelAnimationFrame(frame); frame = 0; } else { last = performance.now(); request(); } }
  function lost(e) { e.preventDefault(); dispose(); onReady(false); }
  function dispose() {
    if (!alive) return; alive = false; cancelAnimationFrame(frame);
    sizes.dispose(); intersectionObserver.disconnect();
    surface.removeEventListener('pointermove', move); surface.removeEventListener('pointerleave', leave);
    document.removeEventListener('visibilitychange', visibility);
    renderer.domElement.removeEventListener('webglcontextlost', lost);
    const geometries = new Set(), materials = new Set(), textures = new Set([shadowTex]);
    scene.traverse(o => {
      if (o.geometry) geometries.add(o.geometry);
      for (const mat of o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : []) {
        materials.add(mat); if (mat.map) textures.add(mat.map);
      }
    });
    geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); textures.forEach(t => t.dispose());
    env.dispose(); renderer.dispose(); renderer.domElement.remove();
    surface.style.removeProperty('min-height');
    cards.forEach(card => { if (card) { card.style.left = ''; card.style.top = ''; card.style.removeProperty('--medal-size'); } });
  }
  intersectionObserver.observe(surface);
  surface.addEventListener('pointermove', move); surface.addEventListener('pointerleave', leave);
  document.addEventListener('visibilitychange', visibility);
  renderer.domElement.addEventListener('webglcontextlost', lost);
  resize(); tick(performance.now()); onReady(true);
  document.fonts?.ready.then(() => { if (alive) sizes.schedule(); });
  return {
    dispose,
    setMotion(value) { state.motion = value; if (!value) { intro = false; medals.forEach(m => m.target = 0); } refresh(); },
    setTurn(value) { state.turn = value; refresh(); },
    highlight(i, value) { if (!state.motion) return; medals[i].target = value ? 1 : 0; request(); }
  };
}
