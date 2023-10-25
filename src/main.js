var canvas = document.getElementById("globe");
var RADIUS = 10;
var earthTexture =
  "https://uploads-ssl.webflow.com/651593f136e68a13c8505220/65266c7f9b18f9270c0db268_earth_black_white.jpg";
var globeFragmentShader = `varying float vVisibility;
varying vec3 vNormal;
varying vec3 vMvPosition;
uniform vec3 diffuse;
uniform float opacity;
#include <common>
#include <color_pars_fragment>
#include <map_particle_pars_fragment>
#include <alphatest_pars_fragment>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
#include <clipping_planes_fragment>
vec3 outgoingLight = vec3( 0.0 );
bool circ = length(gl_PointCoord - 0.5) > 0.5; // make points round
bool vis = dot(vMvPosition, vNormal) < 0.; // visible only on the front side of the sphere
if (circ || vis) discard;
vec3 col = diffuse + (vVisibility > 0.5 ? 0.5 : 0.); // make oceans brighter
vec4 diffuseColor = vec4( col, opacity );
#include <logdepthbuf_fragment>
#include <map_particle_fragment>
#include <color_fragment>
#include <alphatest_fragment>
outgoingLight = diffuseColor.rgb;
#include <output_fragment>
#include <tonemapping_fragment>
#include <encodings_fragment>
#include <fog_fragment>
#include <premultiplied_alpha_fragment>
}`;
var globeVertexShader = `uniform sampler2D globeTexture;
varying float vVisibility;
varying vec3 vNormal;
varying vec3 vMvPosition;
uniform float size;
uniform float scale;
#include <common>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
#ifdef USE_POINTS_UV
varying vec2 vUv;
uniform mat3 uvTransform;
#endif
void main() {
#ifdef USE_POINTS_UV
vUv = ( uvTransform * vec3( uv, 1 ) ).xy;
#endif
#include <color_vertex>
#include <begin_vertex>
#include <morphtarget_vertex>
#include <project_vertex>
vVisibility = texture(globeTexture, uv).g; // get value from texture
if (vVisibility >= 0.9) gl_PointSize = size * 0.1;
else if (vVisibility < 0.9 && vVisibility > 0.2) gl_PointSize = size * 0.8;
else gl_PointSize = size * 0.5;
// gl_PointSize = size * (vVisibility < 0.5 ? 0.45 : 0.1); // size depends on the value
vNormal = normalMatrix * normalize(position);
vMvPosition = -mvPosition.xyz;
gl_PointSize *= 0.4 + (dot(normalize(vMvPosition), vNormal) * 0.6); // size depends position in camera space
#ifdef USE_SIZEATTENUATION
bool isPerspective = isPerspectiveMatrix( projectionMatrix );
if ( isPerspective ) gl_PointSize *= ( scale / - mvPosition.z );
#endif
#include <logdepthbuf_vertex>
#include <clipping_planes_vertex>
#include <worldpos_vertex>
#include <fog_vertex>
}`;
class Globe {
  constructor(canvas, nrOfPoints = 100000) {
    this.canvas = canvas;
    this.nrOfPoints = nrOfPoints;
    this.scene = undefined;
    this.renderer = undefined;
    this.camera = undefined;
    this.controls = undefined;
    this.globalUniforms = {
      time: { value: 0 },
    };
    this.clock = new THREE.Clock();

    this.initRenderers();
    this.initGlobe();
    this.resize();
  }

  resize() {
    this.camera.aspect = window.innerWidth / window.outerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.outerHeight);
    // this.renderer2D.setSize(window.innerWidth, window.outerHeight);
  }

  animationLoop() {
    this.globalUniforms.time.value = this.clock.getElapsedTime();
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    // this.renderer2D.render(this.scene, this.camera);
  }

  initRenderers() {
    this.scene = new THREE.Scene();
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
    });
    this.renderer.setClearColor(0xffffff, 0);
    this.renderer.setPixelRatio(window.devicePixelRatio);

    // this.renderer2D = new CSS2DRenderer({element: this.element2D});
    this.camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.outerHeight,
      0.1,
      1000
    );

    this.camera.position.setZ(15);
    this.camera.position.setX(10);
    window.addEventListener("resize", this.resize.bind(this));

    this.controls = new THREE.OrbitControls(
      this.camera,
      this.renderer.domElement
    );
    this.controls.enablePan = false;
    this.controls.enableZoom = false;
    this.controls.enableDamping = true;
    this.controls.autoRotate = true;
    this.controls.autoRotateSpeed = 0.5;
    this.controls.touches.ONE = undefined;
    this.controls.touches.TWO = THREE.TOUCH.DOLLY_ROTATE;
    // this.renderer2D.domElement.style.touchAction = "auto";

    this.renderer.setAnimationLoop(this.animationLoop.bind(this));
  }

  initGlobe() {
    const spherical = new THREE.Spherical();

    let r = 0;
    const dlong = Math.PI * (3 - Math.sqrt(5));
    const dz = 2 / this.nrOfPoints;
    let long = 0;
    let z = 1 - dz / 2;

    const pts = [];
    const clr = [];
    const c = new THREE.Color();
    const uvs = [];
    let newPoint;

    for (let i = 0; i < this.nrOfPoints; i++) {
      r = Math.sqrt(1 - z * z);
      newPoint = new THREE.Vector3(
        Math.cos(long) * r,
        z,
        -Math.sin(long) * r
      ).multiplyScalar(RADIUS);
      pts.push(newPoint);
      z = z - dz;
      long = long + dlong;

      c.setHSL(0.45, 0.5, Math.random() * 0.25 + 0.25);
      c.toArray(clr, i * 3);

      spherical.setFromVector3(newPoint);
      uvs.push(
        (spherical.theta + Math.PI) / (Math.PI * 2),
        1.0 - spherical.phi / Math.PI
      );
    }

    const geometry = new THREE.BufferGeometry().setFromPoints(pts);
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(clr, 3));
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));

    const material = new THREE.PointsMaterial({
      size: 0.1,
      vertexColors: true,
      onBeforeCompile: (shader) => {
        shader.uniforms.globeTexture = {
          value: new THREE.TextureLoader().load(earthTexture),
        };
        shader.vertexShader = globeVertexShader;
        shader.fragmentShader = globeFragmentShader;
      },
    });

    const globe = new THREE.Points(geometry, material);
    this.scene.add(globe);
  }
}
var device = generateFlags(navigator.userAgent)
if (device.isMobileOrTablet) {
  canvas.style.pointerEvents = "none";
}
var nrOfPoints = (device.isMobileOrTablet || device.isApple) ? 10000 : 100000;
var globe = new Globe(canvas, nrOfPoints);
