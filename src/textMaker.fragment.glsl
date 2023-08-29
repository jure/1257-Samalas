uniform sampler2D t;
uniform sampler2D m;
varying float l; // length  
varying vec3 c; // color
varying vec2 u;
varying float i;

void main() {
int cp = int(floor(mod(u.x * l, 128.0)));
vec2 messageUV = vec2(
    float(cp) / float(128.0),
    i  / float(1024.0)
);
float ci = texture2D(m, messageUV).r * 255.0;
vec2 cu;
float csu = 0.125;  // 64 pixels / 512 pixels
float row = floor(ci / 8.0);
float col = mod(ci, 8.0);
float sx = u.x * l * csu;
float sy = (-u.y * 0.10 + 0.11);
cu.x = col * csu + mod(sx, csu);
cu.y = (1.0 - row * csu) - mod(sy, csu);
vec4 cc = texture2D(t, cu);
if (cc.a < 0.2) discard;
gl_FragColor = (cc) * vec4(c, 1.0);
}