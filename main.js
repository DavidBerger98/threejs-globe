var canvas = document.getElementById("globe");
var RADIUS = 10;
var earthTexture =
  "https://uploads-ssl.webflow.com/651593f136e68a13c8505220/65266c7f9b18f9270c0db268_earth_black_white.jpg";
var globeFragmentShader = `
    varying float vVisibility;
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
var globeVertexShader = `
    uniform sampler2D globeTexture;
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
    this.camera.aspect = document.body.clientWidth / document.body.clientHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(document.body.clientWidth, document.body.clientHeight);
    // this.renderer2D.setSize(document.body.clientWidth, document.body.clientHeight);
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
      document.body.clientWidth / document.body.clientHeight,
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
      // @ts-ignore
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

function checkIsMobile() {
  let check = false;
  (function (a) {
    if (
      /(android|bb\d+|meego).+mobile|avantgo|bada\/|blackberry|blazer|compal|elaine|fennec|hiptop|iemobile|ip(hone|od)|iris|kindle|lge |maemo|midp|mmp|mobile.+firefox|netfront|opera m(ob|in)i|palm( os)?|phone|p(ixi|re)\/|plucker|pocket|psp|series(4|6)0|symbian|treo|up\.(browser|link)|vodafone|wap|windows ce|xda|xiino/i.test(
        a
      ) ||
      /1207|6310|6590|3gso|4thp|50[1-6]i|770s|802s|a wa|abac|ac(er|oo|s\-)|ai(ko|rn)|al(av|ca|co)|amoi|an(ex|ny|yw)|aptu|ar(ch|go)|as(te|us)|attw|au(di|\-m|r |s )|avan|be(ck|ll|nq)|bi(lb|rd)|bl(ac|az)|br(e|v)w|bumb|bw\-(n|u)|c55\/|capi|ccwa|cdm\-|cell|chtm|cldc|cmd\-|co(mp|nd)|craw|da(it|ll|ng)|dbte|dc\-s|devi|dica|dmob|do(c|p)o|ds(12|\-d)|el(49|ai)|em(l2|ul)|er(ic|k0)|esl8|ez([4-7]0|os|wa|ze)|fetc|fly(\-|_)|g1 u|g560|gene|gf\-5|g\-mo|go(\.w|od)|gr(ad|un)|haie|hcit|hd\-(m|p|t)|hei\-|hi(pt|ta)|hp( i|ip)|hs\-c|ht(c(\-| |_|a|g|p|s|t)|tp)|hu(aw|tc)|i\-(20|go|ma)|i230|iac( |\-|\/)|ibro|idea|ig01|ikom|im1k|inno|ipaq|iris|ja(t|v)a|jbro|jemu|jigs|kddi|keji|kgt( |\/)|klon|kpt |kwc\-|kyo(c|k)|le(no|xi)|lg( g|\/(k|l|u)|50|54|\-[a-w])|libw|lynx|m1\-w|m3ga|m50\/|ma(te|ui|xo)|mc(01|21|ca)|m\-cr|me(rc|ri)|mi(o8|oa|ts)|mmef|mo(01|02|bi|de|do|t(\-| |o|v)|zz)|mt(50|p1|v )|mwbp|mywa|n10[0-2]|n20[2-3]|n30(0|2)|n50(0|2|5)|n7(0(0|1)|10)|ne((c|m)\-|on|tf|wf|wg|wt)|nok(6|i)|nzph|o2im|op(ti|wv)|oran|owg1|p800|pan(a|d|t)|pdxg|pg(13|\-([1-8]|c))|phil|pire|pl(ay|uc)|pn\-2|po(ck|rt|se)|prox|psio|pt\-g|qa\-a|qc(07|12|21|32|60|\-[2-7]|i\-)|qtek|r380|r600|raks|rim9|ro(ve|zo)|s55\/|sa(ge|ma|mm|ms|ny|va)|sc(01|h\-|oo|p\-)|sdk\/|se(c(\-|0|1)|47|mc|nd|ri)|sgh\-|shar|sie(\-|m)|sk\-0|sl(45|id)|sm(al|ar|b3|it|t5)|so(ft|ny)|sp(01|h\-|v\-|v )|sy(01|mb)|t2(18|50)|t6(00|10|18)|ta(gt|lk)|tcl\-|tdg\-|tel(i|m)|tim\-|t\-mo|to(pl|sh)|ts(70|m\-|m3|m5)|tx\-9|up(\.b|g1|si)|utst|v400|v750|veri|vi(rg|te)|vk(40|5[0-3]|\-v)|vm40|voda|vulc|vx(52|53|60|61|70|80|81|83|85|98)|w3c(\-| )|webc|whit|wi(g |nc|nw)|wmlb|wonu|x700|yas\-|your|zeto|zte\-/i.test(
        a.substr(0, 4)
      )
    )
      check = true;
  })(navigator.userAgent || navigator.vendor || window.opera);
  return check;
}
var isMobile = checkIsMobile();
if (isMobile) {
  canvas.style.pointerEvents = "none";
}
var nrOfPoints = isMobile ? 10000 : 100000;
var globe = new Globe(canvas, nrOfPoints);
