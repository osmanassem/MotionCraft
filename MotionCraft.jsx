// MotionCraft: motion tools and per-unit text animation in one dockable panel.
//
// A ScriptUI panel for EffectCraft (Window > MotionCraft.jsx). It uses only the After Effects
// scripting API that EffectCraft reimplements, so it also runs in After Effects.
//
// Original clean-room work: written from public feature descriptions only. No code, names, UI
// or assets from Motion Tools (Motion Design School) or TextEvo (aescripts) were used.
//
// Copyright (c) 2026 Osman Assem / PicklesBucket Ltd. MIT OR Apache-2.0.
//
// Tools
//   Motion: ease selected keyframes, place anchor points on a 3x3 grid, sequence layers or
//           keyframes, add elastic or bounce follow-through with live sliders.
//   Text:   animate a text layer in and/or out by characters, words or lines, with live Delay,
//           Duration and Start sliders (no keyframes to retime).
//   Shapes: create shapes from vector layers, explode shape groups to layers, merge shape layers,
//           clean empty groups.
//
// Set MOTIONCRAFT_NO_UI = true before evaluating this file to load the tools without the panel
// (used by the test suite); the tools are then on the global MotionCraft object.

(function motionCraft(thisObj) {
  var VERSION = "0.1.2";
  var NAME = "MotionCraft";
  var MC = { version: VERSION };

  // ---------------------------------------------------------------- helpers

  function comp() {
    var c = app.project ? app.project.activeItem : null;
    if (!c || !(c instanceof CompItem)) throw new Error("Open a composition first.");
    return c;
  }

  function selectedLayers(c) {
    var s = c.selectedLayers, out = [];
    for (var i = 0; i < s.length; i++) out.push(s[i]);
    if (!out.length) throw new Error("Select at least one layer.");
    return out;
  }

  function clamp(v, lo, hi) { return Math.min(Math.max(v, lo), hi); }

  function undoable(label, fn) {
    app.beginUndoGroup(NAME + ": " + label);
    try { return fn(); } finally { app.endUndoGroup(); }
  }

  // Selected keyframed properties of the selected layers (leaf properties only).
  function selectedKeyedProps(c) {
    var out = [], ls = c.selectedLayers;
    for (var i = 0; i < ls.length; i++) {
      var ps = ls[i].selectedProperties;
      for (var j = 0; j < ps.length; j++) {
        var p = ps[j];
        if (p.propertyType === PropertyType.PROPERTY && p.numKeys > 0) out.push({ layer: ls[i], prop: p });
      }
    }
    return out;
  }

  function easeDims(p) {
    var t = p.propertyValueType;
    if (t === PropertyValueType.TwoD) return 2;
    if (t === PropertyValueType.ThreeD) return 3;
    return 1; // spatial, one-dimensional, colour and shape properties take one ease
  }

  function easeArray(n, influence) {
    var a = [];
    for (var i = 0; i < n; i++) a.push(new KeyframeEase(0, influence));
    return a;
  }

  // An expression control on the layer, found by name or created.
  function control(layer, matchName, name, value) {
    var fx = layer.property("ADBE Effect Parade");
    var e = fx.property(name);
    if (e) return e;
    e = fx.addProperty(matchName);
    e.name = name;
    if (value !== undefined) e.property(1).setValue(value);
    return e;
  }

  // A child by After Effects match name, falling back to EffectCraft's own id where the two
  // differ (EffectCraft 0.21 names the Expression Selector's children "basedOn" and "amount").
  function child(group, matchName, ecId) {
    var p = group.property(matchName);
    return p ? p : group.property(ecId);
  }

  function slider(layer, name, value) { return control(layer, "ADBE Slider Control", name, value); }

  function removeEffectsStartingWith(layer, prefix) {
    var fx = layer.property("ADBE Effect Parade");
    for (var i = fx.numProperties; i >= 1; i--) {
      if (fx.property(i).name.indexOf(prefix) === 0) fx.property(i).remove();
    }
  }

  // ---------------------------------------------------------------- ease

  // Eases the selected keyframes. side: "in", "out" or "both". Influence in percent (0.1-100).
  MC.ease = function (side, inInfluence, outInfluence) {
    return undoable("Ease", function () {
      var c = comp(), items = selectedKeyedProps(c), n = 0;
      if (!items.length) throw new Error("Select keyframes on one or more properties.");
      var ii = clamp(inInfluence, 0.1, 100), oi = clamp(outInfluence, 0.1, 100);
      for (var i = 0; i < items.length; i++) {
        var p = items[i].prop, keys = p.selectedKeys, d = easeDims(p);
        for (var k = 0; k < keys.length; k++) {
          var key = keys[k];
          var inE = side === "out" ? p.keyInTemporalEase(key) : easeArray(d, ii);
          var outE = side === "in" ? p.keyOutTemporalEase(key) : easeArray(d, oi);
          p.setInterpolationTypeAtKey(key, KeyframeInterpolationType.BEZIER, KeyframeInterpolationType.BEZIER);
          p.setTemporalEaseAtKey(key, inE, outE);
          n++;
        }
      }
      return "Eased " + n + " keyframe" + (n === 1 ? "" : "s") + ".";
    });
  };

  // Returns the selected keyframes to linear interpolation (undoes easing).
  MC.linear = function () {
    return undoable("Linear", function () {
      var c = comp(), items = selectedKeyedProps(c), n = 0;
      if (!items.length) throw new Error("Select keyframes on one or more properties.");
      for (var i = 0; i < items.length; i++) {
        var p = items[i].prop, keys = p.selectedKeys;
        for (var k = 0; k < keys.length; k++) {
          p.setInterpolationTypeAtKey(keys[k], KeyframeInterpolationType.LINEAR, KeyframeInterpolationType.LINEAR);
          n++;
        }
      }
      return "Set " + n + " keyframe" + (n === 1 ? "" : "s") + " to linear.";
    });
  };

  // ---------------------------------------------------------------- anchor point

  // Moves the anchor to a point of the layer's bounds without moving the layer.
  // h and v: 0 (left/top), 0.5 (centre), 1 (right/bottom).
  MC.anchor = function (h, v) {
    return undoable("Anchor Point", function () {
      var c = comp(), ls = selectedLayers(c), n = 0;
      for (var i = 0; i < ls.length; i++) {
        var L = ls[i];
        if (!(L instanceof AVLayer) && !(L instanceof ShapeLayer) && !(L instanceof TextLayer)) continue;
        var r = L.sourceRectAtTime(c.time, false);
        var tr = L.property("ADBE Transform Group");
        var ap = tr.property("ADBE Anchor Point");
        var old = ap.value;
        var na = [r.left + r.width * h, r.top + r.height * v];
        var dx = na[0] - old[0], dy = na[1] - old[1];
        if (Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6) continue;

        // The anchor offset in the parent's space: scaled, then rotated.
        var sc = tr.property("ADBE Scale").value;
        var rot = L.threeDLayer ? tr.property("ADBE Rotate Z").value : tr.property("ADBE Rotate Z").value;
        var sx = dx * sc[0] / 100, sy = dy * sc[1] / 100;
        var a = rot * Math.PI / 180;
        var ox = sx * Math.cos(a) - sy * Math.sin(a);
        var oy = sx * Math.sin(a) + sy * Math.cos(a);

        setShifted(ap, [dx, dy]);
        var pos = tr.property("ADBE Position");
        if (pos.dimensionsSeparated) {
          setShifted(tr.property("ADBE Position_0"), ox);
          setShifted(tr.property("ADBE Position_1"), oy);
        } else {
          setShifted(pos, [ox, oy]);
        }
        n++;
      }
      return "Moved " + n + " anchor point" + (n === 1 ? "" : "s") + ".";
    });
  };

  // Adds an offset to a property's value, or to every keyframe when it is animated.
  function setShifted(p, d) {
    function add(v) {
      if (typeof v === "number") return v + d;
      var o = [];
      for (var i = 0; i < v.length; i++) o.push(v[i] + (i < d.length ? d[i] : 0));
      return o;
    }
    if (p.numKeys > 0) {
      for (var k = 1; k <= p.numKeys; k++) p.setValueAtKey(k, add(p.keyValue(k)));
    } else {
      p.setValue(add(p.value));
    }
  }

  // ---------------------------------------------------------------- sequence

  function ordered(ls, order) {
    var a = ls.slice(0);
    if (order === "top") a.sort(function (x, y) { return x.index - y.index; });
    else if (order === "bottom") a.sort(function (x, y) { return y.index - x.index; });
    else if (order === "random") {
      for (var i = a.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1)), t = a[i];
        a[i] = a[j]; a[j] = t;
      }
    }
    return a; // "selection": the order the layers were selected in
  }

  // Staggers layers (target "layers") or their selected keyframes (target "keys").
  // offset: frames between steps; step: how many layers share a step; order: selection | top |
  // bottom | random.
  MC.sequence = function (target, offset, step, order) {
    return undoable("Sequence", function () {
      var c = comp(), ls = ordered(selectedLayers(c), order);
      var fd = c.frameDuration, st = Math.max(1, Math.round(step)), n = 0;
      if (target === "keys") {
        for (var i = 0; i < ls.length; i++) {
          var dt = Math.floor(i / st) * offset * fd;
          var ps = ls[i].selectedProperties;
          for (var j = 0; j < ps.length; j++) {
            if (ps[j].propertyType === PropertyType.PROPERTY && ps[j].numKeys > 0) n += shiftKeys(ps[j], dt);
          }
        }
        return "Sequenced " + n + " keyframe" + (n === 1 ? "" : "s") + ".";
      }
      var base = ls[0].inPoint;
      for (var m = 0; m < ls.length; m++) {
        var want = base + Math.floor(m / st) * offset * fd;
        ls[m].startTime += want - ls[m].inPoint;
        n++;
      }
      return "Sequenced " + n + " layer" + (n === 1 ? "" : "s") + ".";
    });
  };

  // Moves a property's selected keys (all keys when none are selected) by dt seconds.
  function shiftKeys(p, dt) {
    if (Math.abs(dt) < 1e-9) return 0;
    var sel = p.selectedKeys, idx = [];
    if (sel.length) idx = sel.slice(0);
    else for (var k = 1; k <= p.numKeys; k++) idx.push(k);
    var spatial = p.propertyValueType === PropertyValueType.TwoD_SPATIAL || p.propertyValueType === PropertyValueType.ThreeD_SPATIAL;
    var data = [];
    for (var i = 0; i < idx.length; i++) {
      var q = idx[i];
      data.push({
        t: p.keyTime(q) + dt, v: p.keyValue(q),
        ii: p.keyInInterpolationType(q), oi: p.keyOutInterpolationType(q),
        ie: p.keyInTemporalEase(q), oe: p.keyOutTemporalEase(q),
        st: spatial ? p.keyInSpatialTangent(q) : null, so: spatial ? p.keyOutSpatialTangent(q) : null
      });
    }
    for (var r = idx.length - 1; r >= 0; r--) p.removeKey(idx[r]);
    for (var a = 0; a < data.length; a++) {
      var d = data[a];
      p.setValueAtTime(d.t, d.v);
      var nk = p.nearestKeyIndex(d.t);
      p.setInterpolationTypeAtKey(nk, d.ii, d.oi);
      if (d.ii === KeyframeInterpolationType.BEZIER || d.oi === KeyframeInterpolationType.BEZIER) p.setTemporalEaseAtKey(nk, d.ie, d.oe);
      if (spatial) p.setSpatialTangentsAtKey(nk, d.st, d.so);
    }
    return data.length;
  }

  // ---------------------------------------------------------------- elastic and bounce

  var ELASTIC = [
    "// MotionCraft Elastic",
    "var amp = effect(\"MC Elastic Amplitude\")(1) / 100;",
    "var freq = effect(\"MC Elastic Frequency\")(1);",
    "var decay = effect(\"MC Elastic Decay\")(1);",
    "var n = 0;",
    "if (numKeys > 0) { n = nearestKey(time).index; if (key(n).time > time) n--; }",
    "var t = n > 0 ? time - key(n).time : 0;",
    "if (n > 1 && t > 0) {",
    "  var v = velocityAtTime(key(n).time - thisComp.frameDuration / 10);",
    "  value + v * amp * Math.sin(freq * t * 2 * Math.PI) / Math.exp(decay * t);",
    "} else { value; }"
  ].join("\n");

  var BOUNCE = [
    "// MotionCraft Bounce",
    "var e = effect(\"MC Bounce Elasticity\")(1) / 100;",
    "var g = Math.max(effect(\"MC Bounce Gravity\")(1), 1);",
    "var most = Math.round(effect(\"MC Bounce Count\")(1));",
    "var n = 0;",
    "if (numKeys > 0) { n = nearestKey(time).index; if (key(n).time > time) n--; }",
    "var t = n > 0 ? time - key(n).time : 0;",
    "if (n > 1 && t > 0 && most > 0) {",
    "  var v = velocityAtTime(key(n).time - thisComp.frameDuration / 10);",
    "  var flat = typeof v === \"number\";",
    "  var s = flat ? Math.abs(v) : length(v);",
    "  var dir = flat ? (v < 0 ? 1 : -1) : (s > 0 ? mul(v, -1 / s) : v * 0);",
    "  s *= e;",
    "  var dur = 2 * s / g, t0 = 0, t1 = dur, b = 1;",
    "  while (t1 < t && b < most) { s *= e; dur *= e; t0 = t1; t1 += dur; b++; }",
    "  if (t < t1) { var u = t - t0; value + mul(dir, u * (s - g * u / 2)); } else { value; }",
    "} else { value; }"
  ].join("\n");

  // Adds follow-through after each keyframe of the selected properties. kind: "elastic" | "bounce".
  MC.follow = function (kind) {
    return undoable(kind === "bounce" ? "Bounce" : "Elastic", function () {
      var c = comp(), items = selectedKeyedProps(c), n = 0;
      if (!items.length) throw new Error("Select one or more keyframed properties.");
      for (var i = 0; i < items.length; i++) {
        var L = items[i].layer, p = items[i].prop;
        if (!p.canSetExpression) continue;
        if (kind === "bounce") {
          slider(L, "MC Bounce Elasticity", 60);
          slider(L, "MC Bounce Gravity", 5000);
          slider(L, "MC Bounce Count", 4);
          p.expression = BOUNCE;
        } else {
          slider(L, "MC Elastic Amplitude", 5);
          slider(L, "MC Elastic Frequency", 2.5);
          slider(L, "MC Elastic Decay", 6);
          p.expression = ELASTIC;
        }
        n++;
      }
      return "Added " + kind + " to " + n + " propert" + (n === 1 ? "y" : "ies") + ".";
    });
  };

  // Removes MotionCraft elastic/bounce expressions from the selected properties (all keyframed
  // properties of the selected layers when none is selected) and drops unused controls.
  MC.followRemove = function () {
    return undoable("Remove Follow-through", function () {
      var c = comp(), ls = selectedLayers(c), n = 0;
      function sweep(group, onlySelected, found) {
        for (var i = 1; i <= group.numProperties; i++) {
          var p = group.property(i);
          if (p.propertyType === PropertyType.PROPERTY) {
            if (onlySelected && !p.selected) continue;
            if (p.canSetExpression && p.expression && /^\/\/ MotionCraft (Elastic|Bounce)/.test(p.expression)) {
              p.expression = ""; n++;
            }
          } else if (p.matchName !== "ADBE Effect Parade") {
            sweep(p, onlySelected, found);
          }
        }
      }
      function uses(group, word) {
        for (var i = 1; i <= group.numProperties; i++) {
          var p = group.property(i);
          if (p.propertyType === PropertyType.PROPERTY) {
            if (p.canSetExpression && p.expression && p.expression.indexOf("// MotionCraft " + word) === 0) return true;
          } else if (p.matchName !== "ADBE Effect Parade" && uses(p, word)) return true;
        }
        return false;
      }
      for (var i = 0; i < ls.length; i++) {
        var L = ls[i], some = false, sp = L.selectedProperties;
        for (var j = 0; j < sp.length; j++) if (sp[j].propertyType === PropertyType.PROPERTY) some = true;
        sweep(L, some);
        if (!uses(L, "Elastic")) removeEffectsStartingWith(L, "MC Elastic ");
        if (!uses(L, "Bounce")) removeEffectsStartingWith(L, "MC Bounce ");
      }
      return "Removed follow-through from " + n + " propert" + (n === 1 ? "y" : "ies") + ".";
    });
  };

  // ---------------------------------------------------------------- text

  // Order of units: forward, backward, center (middle first), edges (ends first), random.
  var ORDER_K = {
    forward: "i",
    backward: "(n - 1 - i)",
    center: "Math.round(Math.abs(i - (n - 1) / 2))",
    edges: "(Math.round((n - 1) / 2) - Math.round(Math.abs(i - (n - 1) / 2)))",
    random: "(seedRandom(i + 7, true), Math.floor(random(n)))"
  };
  var ORDER_MAX = {
    forward: "(n - 1)", backward: "(n - 1)", random: "(n - 1)",
    center: "Math.round((n - 1) / 2)", edges: "Math.round((n - 1) / 2)"
  };
  var EASES = {
    linear: "p",
    smooth: "(p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2)",
    soft: "(1 - Math.pow(1 - p, 3))",
    strong: "(p >= 1 ? 1 : 1 - Math.pow(2, -10 * p))",
    back: "(1 + 2.70158 * Math.pow(p - 1, 3) + 1.70158 * Math.pow(p - 1, 2))"
  };
  var BASED_ON = { characters: 1, nospaces: 2, words: 3, lines: 4 };

  function textExpression(phase, order, ease) {
    var P = "MC " + (phase === "out" ? "Out" : "In") + " ";
    var lines = [
      "// MotionCraft Text " + (phase === "out" ? "Out" : "In"),
      "var fd = thisComp.frameDuration;",
      "var delay = effect(\"" + P + "Delay\")(1) * fd;",
      "var dur = Math.max(effect(\"" + P + "Duration\")(1), 1) * fd;",
      "var n = textTotal, i = textIndex - 1;",
      "var k = " + (ORDER_K[order] || ORDER_K.forward) + ";"
    ];
    if (phase === "out") {
      lines.push("var start = outPoint - effect(\"" + P + "End\")(1) * fd - " + (ORDER_MAX[order] || ORDER_MAX.forward) + " * delay - dur;");
    } else {
      lines.push("var start = inPoint + effect(\"" + P + "Start\")(1) * fd;");
    }
    lines.push("var p = Math.min(Math.max((time - start - k * delay) / dur, 0), 1);");
    // The animator holds the hidden state: 100% before the unit comes in, 0% once it has.
    var e = EASES[ease] || EASES.smooth;
    lines.push(phase === "out" ? "100 * " + e + ";" : "100 * (1 - " + e + ");");
    return lines.join("\n");
  }

  function setAnimatorProps(anim, look, phase) {
    var props = anim.property("ADBE Text Animator Properties");
    var sign = phase === "out" ? (look.mirrorOut ? -1 : 1) : 1;
    // Opacity the units start from (and end at on Out); 100 leaves opacity alone.
    var op = look.opacity === true ? 0 : look.opacity === false ? 100 : clamp(Number(look.opacity), 0, 100);
    if (op < 100) props.addProperty("ADBE Text Opacity").setValue(op);
    if (look.moveX || look.moveY) props.addProperty("ADBE Text Position 3D").setValue([look.moveX * sign, look.moveY * sign, 0]);
    if (look.scale !== 100 && look.scale !== undefined && look.scale !== null) props.addProperty("ADBE Text Scale 3D").setValue([look.scale, look.scale, 100]);
    if (look.rotation) props.addProperty("ADBE Text Rotation").setValue(look.rotation * sign);
    if (look.blur) props.addProperty("ADBE Text Blur").setValue([look.blur, look.blur]);
    if (look.tracking) props.addProperty("ADBE Text Tracking Amount").setValue(look.tracking);
  }

  function findAnimator(layer, name) {
    var anims = layer.property("ADBE Text Properties").property("ADBE Text Animators");
    for (var i = anims.numProperties; i >= 1; i--) if (anims.property(i).name === name) return anims.property(i);
    return null;
  }

  // Animates the selected text layers. o: {
  //   phases: "in" | "out" | "both", basedOn: characters | nospaces | words | lines,
  //   order: forward | backward | center | edges | random, ease: linear | smooth | soft | strong | back,
  //   delay, duration, start (frames),
  //   look: { opacity (0-100, the starting opacity), moveX, moveY, scale, rotation, blur, tracking, mirrorOut } }
  MC.textAnimate = function (o) {
    return undoable("Text", function () {
      var c = comp(), ls = selectedLayers(c), n = 0;
      var phases = o.phases === "both" ? ["in", "out"] : [o.phases === "out" ? "out" : "in"];
      for (var i = 0; i < ls.length; i++) {
        var L = ls[i];
        if (!(L instanceof TextLayer)) continue;
        for (var f = 0; f < phases.length; f++) {
          var ph = phases[f], tag = ph === "out" ? "Out" : "In";
          var old = findAnimator(L, NAME + " " + tag);
          if (old) old.remove();
          removeEffectsStartingWith(L, "MC " + tag + " ");
          slider(L, "MC " + tag + " Delay", o.delay);
          slider(L, "MC " + tag + " Duration", o.duration);
          slider(L, "MC " + tag + " " + (ph === "out" ? "End" : "Start"), o.start || 0);

          var anims = L.property("ADBE Text Properties").property("ADBE Text Animators");
          var anim = anims.addProperty("ADBE Text Animator");
          anim.name = NAME + " " + tag;
          setAnimatorProps(anim, o.look, ph);
          var sel = anim.property("ADBE Text Selectors").addProperty("ADBE Text Expressible Selector");
          child(sel, "ADBE Text Range Type2", "basedOn").setValue(BASED_ON[o.basedOn] || 1);
          child(sel, "ADBE Text Expressible Amount", "amount").expression = textExpression(ph, o.order, o.ease);
        }
        n++;
      }
      if (!n) throw new Error("Select one or more text layers.");
      return "Animated " + n + " text layer" + (n === 1 ? "" : "s") + ".";
    });
  };

  // Removes MotionCraft text animators and their controls from the selected text layers.
  MC.textRemove = function () {
    return undoable("Remove Text Animation", function () {
      var c = comp(), ls = selectedLayers(c), n = 0;
      for (var i = 0; i < ls.length; i++) {
        if (!(ls[i] instanceof TextLayer)) continue;
        var tags = ["In", "Out"];
        for (var t = 0; t < tags.length; t++) {
          var a = findAnimator(ls[i], NAME + " " + tags[t]);
          if (a) { a.remove(); n++; }
          removeEffectsStartingWith(ls[i], "MC " + tags[t] + " ");
        }
      }
      return "Removed " + n + " animator" + (n === 1 ? "" : "s") + ".";
    });
  };

  // ---------------------------------------------------------------- shapes

  MC.shapesFromVector = function () {
    return undoable("Shapes from Vector", function () {
      selectedLayers(comp());
      if (typeof app.run === "function") {
        // EffectCraft: the engine command behind Layer > Create > Create Shapes from Vector Layer.
        var r = app.run("layer.create", { op: "shapesFromVector" });
        var made = r && r.layers ? r.layers.length : 0;
        var msg = "Created " + made + " shape layer" + (made === 1 ? "" : "s") + ".";
        if (r && r.skipped && r.skipped.length) msg += " Skipped: " + r.skipped.join("; ");
        return msg;
      }
      var id = app.findMenuCommandId("Create Shapes from Vector Layer");
      if (!id) throw new Error("This version has no Create Shapes from Vector Layer command.");
      app.executeCommand(id);
      return "Created shapes from the selected vector layers.";
    });
  };

  function contentsOf(layer) { return layer.property("ADBE Root Vectors Group"); }

  // Splits each selected shape layer into one layer per top-level group.
  MC.explode = function () {
    return undoable("Explode Shape Groups", function () {
      var c = comp(), ls = selectedLayers(c), made = 0;
      for (var i = 0; i < ls.length; i++) {
        var L = ls[i];
        if (!(L instanceof ShapeLayer)) continue;
        var root = contentsOf(L), total = root.numProperties;
        if (total < 2) continue;
        for (var g = total; g >= 1; g--) {
          var d = L.duplicate();
          var dr = contentsOf(d);
          var keepName = root.property(g).name;
          for (var r = dr.numProperties; r >= 1; r--) if (r !== g) dr.property(r).remove();
          d.name = L.name + " - " + keepName;
          made++;
        }
        L.enabled = false;
      }
      if (!made) throw new Error("Select shape layers that have two or more groups.");
      return "Made " + made + " layer" + (made === 1 ? "" : "s") + "; the originals are hidden.";
    });
  };

  function same(a, b) {
    if (a === b) return true;
    if (!a || !b || typeof a !== "object" || typeof b !== "object" || a.length === undefined || a.length !== b.length) return false;
    for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }

  // Copies a property tree: indexed groups get new children, named groups are walked, values and
  // keyframes are copied. Returns the names of properties that could not be copied.
  function copyTree(src, dst) {
    var missed = [];
    for (var i = 1; i <= src.numProperties; i++) {
      var s = src.property(i), d = null;
      if (src.propertyType === PropertyType.INDEXED_GROUP) {
        if (!dst.canAddProperty(s.matchName)) { missed.push(s.name); continue; }
        d = dst.addProperty(s.matchName);
        try { d.name = s.name; } catch (e) {}
      } else {
        d = dst.property(s.matchName);
        if (!d) { missed.push(s.name); continue; }
      }
      try { d.enabled = s.enabled; } catch (e2) {}
      if (s.propertyType === PropertyType.PROPERTY) {
        try {
          if (s.numKeys > 0) {
            for (var k = 1; k <= s.numKeys; k++) d.setValueAtTime(s.keyTime(k), s.keyValue(k));
          } else if (s.propertyValueType !== PropertyValueType.NO_VALUE && !same(d.value, s.value)) {
            d.setValue(s.value);
          }
          if (s.expression && d.canSetExpression) d.expression = s.expression;
        } catch (e3) { missed.push(s.name + " (" + e3.message + ")"); }
      } else {
        missed = missed.concat(copyTree(s, d));
      }
    }
    return missed;
  }

  // Merges the selected shape layers into the topmost one. Each source layer's position offset is
  // moved onto its groups; layer scale and rotation are not carried over.
  MC.merge = function () {
    return undoable("Merge Shape Layers", function () {
      var c = comp(), ls = selectedLayers(c), shapes = [];
      for (var i = 0; i < ls.length; i++) if (ls[i] instanceof ShapeLayer) shapes.push(ls[i]);
      if (shapes.length < 2) throw new Error("Select two or more shape layers.");
      shapes.sort(function (a, b) { return a.index - b.index; });
      var T = shapes[0], troot = contentsOf(T), missed = [];
      var tt = T.property("ADBE Transform Group");
      var tpos = tt.property("ADBE Position").value, tap = tt.property("ADBE Anchor Point").value;
      // Later layers sit below: add them in reverse so the stacking order is kept.
      for (var j = shapes.length - 1; j >= 1; j--) {
        var S = shapes[j], st = S.property("ADBE Transform Group");
        var spos = st.property("ADBE Position").value, sap = st.property("ADBE Anchor Point").value;
        var off = [spos[0] - sap[0] - (tpos[0] - tap[0]), spos[1] - sap[1] - (tpos[1] - tap[1])];
        var before = troot.numProperties;
        missed = missed.concat(copyTree(contentsOf(S), troot));
        for (var g = before + 1; g <= troot.numProperties; g++) {
          var grp = troot.property(g);
          if (grp.matchName !== "ADBE Vector Group") continue;
          var gp = grp.property("ADBE Vector Transform Group").property("ADBE Vector Position");
          setShifted(gp, off);
        }
        S.enabled = false;
      }
      var msg = "Merged " + (shapes.length - 1) + " layer" + (shapes.length === 2 ? "" : "s") + " into \"" + T.name + "\"; the originals are hidden.";
      if (missed.length) msg += " Not copied: " + missed.join(", ") + ".";
      return msg;
    });
  };

  // Removes empty groups and disabled items from the selected shape layers.
  MC.clean = function () {
    return undoable("Clean Shape Layers", function () {
      var c = comp(), ls = selectedLayers(c), n = 0;
      function sweep(group) {
        for (var i = group.numProperties; i >= 1; i--) {
          var p = group.property(i);
          if (p.matchName === "ADBE Vector Group") {
            var inner = p.property("ADBE Vectors Group");
            sweep(inner);
            if (inner.numProperties === 0 || !p.enabled) { p.remove(); n++; }
          } else if (!p.enabled) { p.remove(); n++; }
        }
      }
      for (var i = 0; i < ls.length; i++) if (ls[i] instanceof ShapeLayer) sweep(contentsOf(ls[i]));
      return "Removed " + n + " empty or hidden item" + (n === 1 ? "" : "s") + ".";
    });
  };

  // ---------------------------------------------------------------- panel

  if (typeof MOTIONCRAFT_NO_UI !== "undefined" && MOTIONCRAFT_NO_UI) {
    $.global.MotionCraft = MC;
    return;
  }

  function run(fn) {
    try {
      var msg = fn();
      if (status) status.text = msg || "";
    } catch (e) {
      if (status) status.text = e.message;
      else alert(e.message);
    }
  }

  function num(field, fallback) {
    var v = parseFloat(field.text);
    return isNaN(v) ? fallback : v;
  }

  function numberRow(parent, label, value, width) {
    var g = parent.add("group");
    g.alignChildren = ["left", "center"];
    var l = g.add("statictext", undefined, label);
    l.preferredSize.width = 70;
    var e = g.add("edittext", undefined, String(value));
    e.characters = width || 5;
    return e;
  }

  var win = thisObj instanceof Panel ? thisObj
    : new Window("palette", NAME + " " + VERSION, undefined, { resizeable: true });
  win.orientation = "column";
  win.alignChildren = ["fill", "top"];
  win.spacing = 6;
  win.margins = 8;

  var tabs = win.add("tabbedpanel");
  tabs.alignChildren = ["fill", "top"];
  // EffectCraft 0.21 gives a tabbed panel zero margins, so its tabs draw over the tab headers.
  // Reserve the header row there; After Effects places tab headers itself.
  if (typeof app.run === "function") tabs.margins = [0, 26, 0, 0];
  var tMotion = tabs.add("tab", undefined, "Motion");
  var tText = tabs.add("tab", undefined, "Text");
  var tShapes = tabs.add("tab", undefined, "Shapes");
  var all = [tMotion, tText, tShapes];
  for (var ti = 0; ti < all.length; ti++) {
    all[ti].orientation = "column";
    all[ti].alignChildren = ["fill", "top"];
    all[ti].spacing = 6;
    all[ti].margins = 8;
  }

  // Motion: ease
  var pEase = tMotion.add("panel", undefined, "Ease");
  pEase.alignChildren = ["fill", "top"];
  var easeIn = numberRow(pEase, "In %", 70);
  var easeOut = numberRow(pEase, "Out %", 70);
  var gEase = pEase.add("group");
  gEase.spacing = 4;
  function easeButton(label, fn) {
    var b = gEase.add("button", undefined, label);
    b.preferredSize = [62, 24];
    b.onClick = function () { run(fn); };
  }
  easeButton("In", function () { return MC.ease("in", num(easeIn, 70), num(easeOut, 70)); });
  easeButton("Both", function () { return MC.ease("both", num(easeIn, 70), num(easeOut, 70)); });
  easeButton("Out", function () { return MC.ease("out", num(easeIn, 70), num(easeOut, 70)); });
  easeButton("Linear", MC.linear);

  // Motion: anchor grid
  var pAnchor = tMotion.add("panel", undefined, "Anchor point");
  pAnchor.alignChildren = ["center", "top"];
  var GRID = [["↖", "↑", "↗"], ["←", "•", "→"], ["↙", "↓", "↘"]];
  for (var gy = 0; gy < 3; gy++) {
    var row = pAnchor.add("group");
    row.spacing = 2;
    for (var gx = 0; gx < 3; gx++) {
      var b = row.add("button", undefined, GRID[gy][gx]);
      b.preferredSize = [30, 24];
      b.hv = [gx / 2, gy / 2];
      b.onClick = function () { var hv = this.hv; run(function () { return MC.anchor(hv[0], hv[1]); }); };
    }
  }

  // Motion: sequence
  var pSeq = tMotion.add("panel", undefined, "Sequence");
  pSeq.alignChildren = ["fill", "top"];
  var seqOffset = numberRow(pSeq, "Offset (fr)", 3);
  var seqStep = numberRow(pSeq, "Step", 1);
  var seqOrder = dropdownRow(pSeq, "Order", ["Selection", "Top down", "Bottom up", "Random"]);
  var gSeq = pSeq.add("group");
  var SEQ_ORDER = ["selection", "top", "bottom", "random"];
  gSeq.add("button", undefined, "Layers").onClick = function () {
    run(function () { return MC.sequence("layers", num(seqOffset, 3), num(seqStep, 1), SEQ_ORDER[seqOrder.selection.index]); });
  };
  gSeq.add("button", undefined, "Keyframes").onClick = function () {
    run(function () { return MC.sequence("keys", num(seqOffset, 3), num(seqStep, 1), SEQ_ORDER[seqOrder.selection.index]); });
  };

  // Motion: follow-through
  var pFollow = tMotion.add("panel", undefined, "Follow-through");
  var gFollow = pFollow.add("group");
  gFollow.spacing = 4;
  gFollow.add("button", undefined, "Elastic").onClick = function () { run(function () { return MC.follow("elastic"); }); };
  gFollow.add("button", undefined, "Bounce").onClick = function () { run(function () { return MC.follow("bounce"); }); };
  gFollow.add("button", undefined, "Remove").onClick = function () { run(MC.followRemove); };

  // Text
  function dropdownRow(parent, label, items) {
    var g = parent.add("group");
    g.alignChildren = ["left", "center"];
    g.add("statictext", undefined, label).preferredSize.width = 70;
    var d = g.add("dropdownlist", undefined, items);
    d.preferredSize.width = 170;
    d.selection = 0;
    return d;
  }
  var pUnits = tText.add("panel", undefined, "Units");
  pUnits.alignChildren = ["fill", "top"];
  var txBased = dropdownRow(pUnits, "Based on", ["Characters", "Characters excl. spaces", "Words", "Lines"]);
  var txOrder = dropdownRow(pUnits, "Order", ["Forward", "Backward", "Centre out", "Edges in", "Random"]);
  var txEase = dropdownRow(pUnits, "Ease", ["Smooth", "Soft", "Strong", "Back", "Linear"]);
  var txDelay = numberRow(pUnits, "Delay (fr)", 2);
  var txDur = numberRow(pUnits, "Duration (fr)", 12);

  var pLook = tText.add("panel", undefined, "Hidden state");
  pLook.alignChildren = ["fill", "top"];
  var lkOpacity = numberRow(pLook, "Opacity %", 0);
  var lkY = numberRow(pLook, "Move Y", 40);
  var lkX = numberRow(pLook, "Move X", 0);
  var lkScale = numberRow(pLook, "Scale %", 100);
  var lkRot = numberRow(pLook, "Rotation", 0);
  var lkBlur = numberRow(pLook, "Blur", 0);
  var lkTrack = numberRow(pLook, "Tracking", 0);
  var lkMirror = pLook.add("checkbox", undefined, "Mirror movement on Out");

  var BASED = ["characters", "nospaces", "words", "lines"];
  var ORDERS = ["forward", "backward", "center", "edges", "random"];
  var EASE_IDS = ["smooth", "soft", "strong", "back", "linear"];
  function textOptions(phases) {
    return {
      phases: phases,
      basedOn: BASED[txBased.selection.index],
      order: ORDERS[txOrder.selection.index],
      ease: EASE_IDS[txEase.selection.index],
      delay: num(txDelay, 2), duration: num(txDur, 12), start: 0,
      look: {
        opacity: num(lkOpacity, 0), moveX: num(lkX, 0), moveY: num(lkY, 0), scale: num(lkScale, 100),
        rotation: num(lkRot, 0), blur: num(lkBlur, 0), tracking: num(lkTrack, 0), mirrorOut: lkMirror.value
      }
    };
  }
  var gText = tText.add("group");
  gText.add("button", undefined, "In").onClick = function () { run(function () { return MC.textAnimate(textOptions("in")); }); };
  gText.add("button", undefined, "Out").onClick = function () { run(function () { return MC.textAnimate(textOptions("out")); }); };
  gText.add("button", undefined, "In + Out").onClick = function () { run(function () { return MC.textAnimate(textOptions("both")); }); };
  tText.add("button", undefined, "Remove MotionCraft text animation").onClick = function () { run(MC.textRemove); };

  // Shapes
  tShapes.add("button", undefined, "Create shapes from vector layer").onClick = function () { run(MC.shapesFromVector); };
  tShapes.add("button", undefined, "Explode groups to layers").onClick = function () { run(MC.explode); };
  tShapes.add("button", undefined, "Merge shape layers").onClick = function () { run(MC.merge); };
  tShapes.add("button", undefined, "Clean empty and hidden groups").onClick = function () { run(MC.clean); };

  var status = win.add("statictext", undefined, "MotionCraft " + VERSION, { truncate: "end" });
  status.alignment = ["fill", "bottom"];

  win.onResizing = win.onResize = function () { this.layout.resize(); };
  if (win instanceof Window) { win.center(); win.show(); }
  else win.layout.layout(true);
})(this);
