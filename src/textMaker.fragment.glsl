uniform sampler2D t;
uniform sampler2D m;
varying float l; // length  
varying vec3 c; // color
varying vec2 u;
varying float i;
uniform float time;
// t = textTexture, m = messageTexture, l = length, c = color, u = uv, i = instance, vUv = uv
// cp = charPos, ci = charIndex, cu = charUV, csu = charSizeUV, sx = scaleX, sy = scaleY
// cc = charColor
void main() {
int cp = int(floor(mod(u.x * l, 128.0)));
vec2 messageUV = vec2(
    float(cp) / float(128.0),
    i  / float(1024.0)
);
float ci = texture2D(m, messageUV).r * 255.0;
vec2 cu;
float csuY = 0.125;  // 64 pixels / 512 pixels
float csuX = (45.0 / 512.0) / 1. ; // 64 pixels / 512 pixels
float row = floor(ci / 8.0);
float col = mod(ci, 8.0);
float sx = (u.x * csuX * l);
float sy = (-u.y * 0.10 + 0.11);
cu.x = (col * csuX) + mod(sx, csuX);
cu.y = (1.0 - row * csuY) - mod(sy, csuY);
vec4 cc = texture2D(t, cu);
if (cc.a < 0.2) {
    discard;
    // gl_FragColor = vec4(ci/48.0, 0.0, 0.0, 1.0);
    // return;
    
};
gl_FragColor = (cc) * vec4(c, 1.0);
}


// Basically working
// t = textTexture, m = messageTexture, l = length, c = color, u = uv, i = instance, vUv = uv
// cp = charPos, ci = charIndex, cu = charUV, csu = charSizeUV, sx = scaleX, sy = scaleY
// cc = charColor
// void main() {
// float adjustment = 1.;
// int cp = int(floor(mod(((u.x * l) / adjustment), 128.0)));
// vec2 messageUV = vec2(
//     float(cp) / float(128.0),
//     i  / float(1024.0)
// );
// float ci = texture2D(m, messageUV).r * 255.0;
// vec2 cu;
// float csuY = 0.125;  // 64 pixels / 512 pixels
// float csuX = (64.0 / 512.0) / 1. ; // 64 pixels / 512 pixels
// float row = floor(ci / 8.0);
// float col = mod(ci, 8.0);
// float sx = (u.x * csuX * l)*0.76 + 0.115;
// float sy = (-u.y * 0.10 + 0.11);
// cu.x = (col * csuX) + mod(sx, csuX*0.75 + 0.0016);
// cu.y = (1.0 - row * csuY) - mod(sy, csuY);
// vec4 cc = texture2D(t, cu);
// if (cc.a < 0.2) {
//     // discard;
//     gl_FragColor = vec4(ci/48.0, 0.0, 0.0, 1.0);
//     return;
    
// };
// gl_FragColor = (cc) * vec4(c, 1.0);
// }




// // Sort of working
// void main() {
// float adjustment = 1.;
// int cp = int(floor(mod(((u.x * l) / adjustment), 128.0)));
// vec2 messageUV = vec2(
//     float(cp) / float(128.0),
//     i  / float(1024.0)
// );
// float ci = texture2D(m, messageUV).r * 255.0;
// vec2 cu;
// float csuY = 0.125;  // 64 pixels / 512 pixels
// float csuX = (64.0 / 512.0) / 1. ; // 64 pixels / 512 pixels
// float row = floor(ci / 8.0);
// float col = mod(ci, 8.0);
// float sx = (u.x * csuX * l)*0.75 + 0.11;
// float sy = (-u.y * 0.10 + 0.11);
// cu.x = (col * csuX) + mod(sx, csuX*0.75);
// cu.y = (1.0 - row * csuY) - mod(sy, csuY);
// vec4 cc = texture2D(t, cu);
// if (cc.a < 0.2) {
//     gl_FragColor = vec4(ci/48.0, 0.0, 0.0, 1.0);
//     return;
// };
// gl_FragColor = (cc) * vec4(c, 1.0);
// }



// void main() {
// float adjustment = 1.1+sin(time/2.0);
// int cp = int(floor(mod(u.x * l / adjustment, 128.0)));
// vec2 messageUV = vec2(
//     float(cp) / float(128.0),
//     i  / float(1024.0)
// );
// float ci = texture2D(m, messageUV).r * 255.0;
// vec2 cu;
// float csuY = 0.125;  // 64 pixels / 512 pixels
// float csuX = 64.0 / 512.0; // 64 pixels / 512 pixels
// float row = floor(ci / 8.0);
// float col = mod(ci, 8.0);
// float sx = (u.x * l) * (csuX / adjustment);
// float sy = (-u.y * 0.10 + 0.11);
// cu.x = (col * csuX) + mod(sx, csuX);
// cu.y = (1.0 - row * csuY) - mod(sy, csuY);
// vec4 cc = texture2D(t, cu);
// if (cc.a < 0.2) {
//     gl_FragColor = vec4(ci/48.0, 0.0, 0.0, 1.0);
//     return;
// };
// gl_FragColor = (cc) * vec4(c, 1.0);
// }



// void main() {
//     float adjustment = 0.125;// abs(sin(time/2.0));

//     // The cp calculation now determines which character in the string we are rendering based on our adjustment.
//     int cp = int(floor(mod(u.x * l / adjustment, 128.0)));

//     vec2 messageUV = vec2(
//         float(cp) / float(128.0),
//         i / float(1024.0)
//     );

//     float ci = texture2D(m, messageUV).r * 255.0;
//     vec2 cu;

//     float csuY = 0.125;  // 64 pixels / 512 pixels
//     float csuX = 64.0 / 512.0; // 32 pixels / 512 pixels

//     float row = floor(ci / 8.0);
//     float col = mod(ci, 8.0);

//     // The sx calculation remains largely unchanged; it determines the x position in the current character's UV space.
//     float sx = u.x * l - float(cp) / l;
//     float sy = (-u.y * 0.10 + 0.11);

//     cu.x = (col * csuX) + mod(sx, csuX);
//     cu.y = (1.0 - row * csuY) - mod(sy, csuY);

//     vec4 cc = texture2D(t, cu);

//     if (cc.a < 0.2) {
//         discard;
//     };

//     gl_FragColor = (cc) * vec4(c, 1.0);
// }