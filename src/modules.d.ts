module "https://unpkg.com/three@0.155.0/build/three.module.js" {
  import content = require("three");

  export = content;
}

module "https://unpkg.com/three@0.155.0/examples/jsm" {
  import content = require("three/examples/jsm");

  export = content;
}
