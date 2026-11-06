// MotionCraft headless tests for effectcraft-cli. Run with tests/run.sh.
var results = [], failed = 0;
function ok(name, cond, info) {
  results.push((cond ? "PASS " : "FAIL ") + name + (info !== undefined ? "  [" + info + "]" : ""));
  if (!cond) failed++;
}
function near(a, b, eps) { return Math.abs(a - b) <= (eps || 1e-3); }
function attempt(name, fn) {
  try { fn(); } catch (e) { ok(name + " threw", false, e.message || String(e)); }
}
function selectOnly(c, layers) {
  for (var i = 1; i <= c.numLayers; i++) c.layer(i).selected = false;
  for (var j = 0; j < layers.length; j++) layers[j].selected = true;
}
function deselectKeys(p) { for (var k = 1; k <= p.numKeys; k++) p.setSelectedAtKey(k, false); }

var MC = $.global.MotionCraft;
var c = app.project.items.addComp("MC Test", 1920, 1080, 1, 6, 30);
c.openInViewer();
ok("active comp", app.project.activeItem === c || (app.project.activeItem && app.project.activeItem.name === "MC Test"));

// ---- ease
attempt("ease", function () {
  var s = c.layers.addSolid([1, 0, 0], "Ease Solid", 200, 200, 1);
  var pos = s.property("ADBE Transform Group").property("ADBE Position");
  pos.setValueAtTime(0, [200, 540]);
  pos.setValueAtTime(1, [1600, 540]);
  var op = s.property("ADBE Transform Group").property("ADBE Opacity");
  op.setValueAtTime(0, 0); op.setValueAtTime(1, 100);
  selectOnly(c, [s]);
  pos.selected = true; op.selected = true;
  pos.setSelectedAtKey(1, true); pos.setSelectedAtKey(2, true);
  op.setSelectedAtKey(1, true); op.setSelectedAtKey(2, true);
  var msg = MC.ease("both", 80, 60);
  ok("ease message", msg.indexOf("Eased 4") === 0, msg);
  ok("ease in influence", near(pos.keyInTemporalEase(2)[0].influence, 80), pos.keyInTemporalEase(2)[0].influence);
  ok("ease out influence", near(pos.keyOutTemporalEase(1)[0].influence, 60), pos.keyOutTemporalEase(1)[0].influence);
  ok("ease speed 0", near(op.keyOutTemporalEase(1)[0].speed, 0));
  MC.ease("in", 33, 99);
  ok("ease in-only keeps out side", near(op.keyOutTemporalEase(1)[0].influence, 60), op.keyOutTemporalEase(1)[0].influence);
  ok("ease in-only sets in side", near(op.keyInTemporalEase(2)[0].influence, 33));
  // an eased middle should lag a linear one
  var mid = pos.valueAtTime(0.25, false)[0];
  ok("ease changes motion", mid < 200 + 1400 * 0.25 - 1, mid);
  pos.setSelectedAtKey(1, true); pos.setSelectedAtKey(2, true);
  op.setSelectedAtKey(1, true); op.setSelectedAtKey(2, true);
  var ml = MC.linear();
  ok("linear msg", ml.indexOf("Set 4 keyframes to linear") === 0, ml);
  ok("linear interpolation", pos.keyOutInterpolationType(1) === KeyframeInterpolationType.LINEAR && op.keyInInterpolationType(2) === KeyframeInterpolationType.LINEAR);
  ok("linear motion restored", near(pos.valueAtTime(0.25, false)[0], 550, 0.5), pos.valueAtTime(0.25, false)[0]);
  s.remove();
});

// ---- anchor
attempt("anchor", function () {
  var L = c.layers.addShape();
  L.name = "Anchor Box";
  var g = L.property("ADBE Root Vectors Group").addProperty("ADBE Vector Group");
  var inner = g.property("ADBE Vectors Group");
  inner.addProperty("ADBE Vector Shape - Rect").property("ADBE Vector Rect Size").setValue([400, 200]);
  inner.addProperty("ADBE Vector Graphic - Fill");
  var tr = L.property("ADBE Transform Group");
  tr.property("ADBE Position").setValue([960, 540]);
  tr.property("ADBE Scale").setValue([50, 50]);
  tr.property("ADBE Rotate Z").setValue(90);
  selectOnly(c, [L]);
  var r0 = L.sourceRectAtTime(0, false);
  ok("anchor rect", near(r0.width, 400, 2) && near(r0.height, 200, 2), r0.left + "," + r0.top + " " + r0.width + "x" + r0.height);
  var msg = MC.anchor(0, 0);
  var ap = tr.property("ADBE Anchor Point").value, p = tr.property("ADBE Position").value;
  ok("anchor to top-left", near(ap[0], r0.left, 0.5) && near(ap[1], r0.top, 0.5), ap.join(","));
  // dx=-200, dy=-100, scaled 0.5 -> (-100,-50), rotated 90deg -> (50,-100)
  ok("anchor compensates position", near(p[0], 1010, 0.5) && near(p[1], 440, 0.5), p.join(","));
  MC.anchor(0.5, 0.5);
  p = tr.property("ADBE Position").value;
  ok("anchor back to centre restores position", near(p[0], 960, 0.5) && near(p[1], 540, 0.5), p.join(","));
  L.remove();
});

// ---- sequence layers
attempt("sequence", function () {
  var a = c.layers.addSolid([0, 1, 0], "Seq A", 100, 100, 1);
  var b = c.layers.addSolid([0, 1, 0], "Seq B", 100, 100, 1);
  var d = c.layers.addSolid([0, 1, 0], "Seq C", 100, 100, 1);
  selectOnly(c, [a, b, d]);
  var msg = MC.sequence("layers", 5, 1, "top");
  var top = [d, b, a]; // the last added sits on top
  ok("sequence msg", msg.indexOf("Sequenced 3 layers") === 0, msg);
  ok("sequence first", near(top[0].inPoint, 0), top[0].inPoint);
  ok("sequence second", near(top[1].inPoint, 5 / 30), top[1].inPoint);
  ok("sequence third", near(top[2].inPoint, 10 / 30), top[2].inPoint);
  MC.sequence("layers", 4, 2, "top");
  ok("sequence step 2 shares", near(top[1].inPoint, 0) && near(top[2].inPoint, 4 / 30), top[1].inPoint + "," + top[2].inPoint);

  // keys
  var ps = [];
  for (var i = 0; i < 3; i++) {
    var op = top[i].property("ADBE Transform Group").property("ADBE Opacity");
    op.setValueAtTime(1, 0); op.setValueAtTime(2, 100);
    op.setInterpolationTypeAtKey(2, KeyframeInterpolationType.HOLD, KeyframeInterpolationType.HOLD);
    deselectKeys(op);
    op.selected = true;
    ps.push(op);
  }
  var m2 = MC.sequence("keys", 6, 1, "top");
  ok("sequence keys msg", m2.indexOf("Sequenced 4 keyframes") === 0, m2); // layer 1 has no offset
  ok("sequence keys layer 1 unchanged", near(ps[0].keyTime(1), 1), ps[0].keyTime(1));
  ok("sequence keys layer 2 +6f", near(ps[1].keyTime(1), 1.2) && near(ps[1].keyTime(2), 2.2), ps[1].keyTime(1));
  ok("sequence keys layer 3 +12f", near(ps[2].keyTime(1), 1.4), ps[2].keyTime(1));
  ok("sequence keys keeps interpolation", ps[2].keyInInterpolationType(2) === KeyframeInterpolationType.HOLD, ps[2].keyInInterpolationType(2));
  ok("sequence keys keeps value", near(ps[2].keyValue(2), 100));
  a.remove(); b.remove(); d.remove();
});

// ---- follow-through
attempt("follow", function () {
  var s = c.layers.addSolid([0, 0, 1], "Follow", 100, 100, 1);
  var pos = s.property("ADBE Transform Group").property("ADBE Position");
  pos.setValueAtTime(0, [200, 540]);
  pos.setValueAtTime(0.5, [1200, 540]);
  selectOnly(c, [s]);
  pos.selected = true;
  var msg = MC.follow("elastic");
  ok("elastic msg", msg.indexOf("Added elastic to 1") === 0, msg);
  ok("elastic expression set", pos.expression.indexOf("MotionCraft Elastic") >= 0);
  ok("elastic no error", !pos.expressionError, pos.expressionError);
  ok("elastic controls", !!s.property("ADBE Effect Parade").property("MC Elastic Amplitude"));
  var v1 = pos.valueAtTime(0.6, false)[0];
  ok("elastic overshoots", Math.abs(v1 - 1200) > 1, v1);
  ok("elastic settles", near(pos.valueAtTime(5, false)[0], 1200, 0.5), pos.valueAtTime(5, false)[0]);

  var sc = s.property("ADBE Transform Group").property("ADBE Rotate Z");
  sc.setValueAtTime(0, 0); sc.setValueAtTime(0.5, 180);
  pos.selected = false; sc.selected = true;
  var m2 = MC.follow("bounce");
  ok("bounce msg", m2.indexOf("Added bounce to 1") === 0, m2);
  ok("bounce no error", !sc.expressionError, sc.expressionError);
  var b1 = sc.valueAtTime(0.6, false);
  ok("bounce stays on the near side", b1 < 180 - 0.5, b1);
  ok("bounce settles", near(sc.valueAtTime(5, false), 180, 0.5), sc.valueAtTime(5, false));
  sc.selected = false; pos.selected = false;
  var mr = MC.followRemove();
  ok("remove msg", mr.indexOf("Removed follow-through from 2") === 0, mr);
  ok("remove clears expressions", !pos.expression && !sc.expression);
  ok("remove drops controls", s.property("ADBE Effect Parade").numProperties === 0, s.property("ADBE Effect Parade").numProperties);
  ok("remove restores motion", near(pos.valueAtTime(0.6, false)[0], 1200, 0.5), pos.valueAtTime(0.6, false)[0]);
  s.remove();
});

// ---- text
var textLayer = null;
attempt("text", function () {
  var t = c.layers.addText("Hello brave world");
  t.name = "MC Title";
  textLayer = t;
  selectOnly(c, [t]);
  var o = {
    phases: "both", basedOn: "words", order: "forward", ease: "smooth",
    delay: 6, duration: 12, start: 0,
    look: { opacity: 0, moveX: 0, moveY: 60, scale: 100, rotation: 0, blur: 8, tracking: 0, mirrorOut: true }
  };
  var msg = MC.textAnimate(o);
  ok("text msg", msg.indexOf("Animated 1 text layer") === 0, msg);
  var anims = t.property("ADBE Text Properties").property("ADBE Text Animators");
  ok("two animators", anims.numProperties === 2, anims.numProperties);
  var aIn = anims.property("MotionCraft In");
  ok("in animator named", !!aIn);
  var sel = aIn.property("ADBE Text Selectors").property(1);
  ok("expression selector", sel.matchName === "ADBE Text Expressible Selector", sel.matchName);
  var based = sel.property("ADBE Text Range Type2") || sel.property("basedOn");
  ok("based on words", based && based.value === 3, based ? based.value : "missing");
  var amt = sel.property("ADBE Text Expressible Amount") || sel.property("amount");
  ok("amount expression", amt && amt.expression.indexOf("MotionCraft Text In") >= 0);
  ok("amount no error", amt && !amt.expressionError, amt ? amt.expressionError : "");
  var props = aIn.property("ADBE Text Animator Properties");
  ok("in props", props.numProperties === 3, props.numProperties);
  var aOut = anims.property("MotionCraft Out");
  var outPos = aOut.property("ADBE Text Animator Properties").property("ADBE Text Position 3D").value;
  ok("out mirrored", near(outPos[1], -60), outPos.join(","));
  var fx = t.property("ADBE Effect Parade");
  ok("controls", fx.numProperties === 6, fx.numProperties);
  ok("in opacity 0", near(props.property("ADBE Text Opacity").value, 0));
  ok("delay slider", near(fx.property("MC In Delay").property(1).value, 6));

  // re-apply replaces, does not stack
  MC.textAnimate(o);
  ok("re-apply replaces", anims.numProperties === 2 && fx.numProperties === 6, anims.numProperties + "/" + fx.numProperties);

  // characters + random, in only
  o.phases = "in"; o.basedOn = "characters"; o.order = "random"; o.ease = "back";
  MC.textAnimate(o);
  ok("in-only keeps out", anims.numProperties === 2, anims.numProperties);
  ok("based on characters", (function(){ var q = anims.property("MotionCraft In").property("ADBE Text Selectors").property(1); return (q.property("ADBE Text Range Type2") || q.property("basedOn")).value === 1; })());
  ok("random no error", (function(){ var q = anims.property("MotionCraft In").property("ADBE Text Selectors").property(1); return !(q.property("ADBE Text Expressible Amount") || q.property("amount")).expressionError; })());

  o.look.opacity = 40;
  MC.textAnimate(o);
  ok("partial opacity", near(anims.property("MotionCraft In").property("ADBE Text Animator Properties").property("ADBE Text Opacity").value, 40));
  o.look.opacity = 100;
  MC.textAnimate(o);
  ok("opacity 100 adds no opacity property", !anims.property("MotionCraft In").property("ADBE Text Animator Properties").property("ADBE Text Opacity"));
  o.basedOn = "words"; o.order = "forward"; o.ease = "smooth"; o.look.opacity = 0;
  MC.textAnimate(o);
});

// ---- shapes
attempt("shapes", function () {
  var L = c.layers.addShape();
  L.name = "Icons";
  var root = L.property("ADBE Root Vectors Group");
  var names = ["Square", "Circle", "Empty"];
  for (var i = 0; i < 3; i++) {
    var g = root.addProperty("ADBE Vector Group");
    g.name = names[i];
    var inner = g.property("ADBE Vectors Group");
    if (i === 0) inner.addProperty("ADBE Vector Shape - Rect");
    if (i === 1) inner.addProperty("ADBE Vector Shape - Ellipse");
    if (i < 2) inner.addProperty("ADBE Vector Graphic - Fill");
  }
  selectOnly(c, [L]);
  var m = MC.clean();
  ok("clean removes empty group", root.numProperties === 2, m);
  var before = c.numLayers;
  m = MC.explode();
  ok("explode makes 2 layers", c.numLayers === before + 2, m);
  ok("explode hides original", L.enabled === false);
  var sq = null, ci = null;
  for (var k = 1; k <= c.numLayers; k++) {
    if (c.layer(k).name === "Icons - Square") sq = c.layer(k);
    if (c.layer(k).name === "Icons - Circle") ci = c.layer(k);
  }
  ok("explode names", !!sq && !!ci);
  ok("explode keeps one group", sq && sq.property("ADBE Root Vectors Group").numProperties === 1 && sq.property("ADBE Root Vectors Group").property(1).name === "Square");

  ci.property("ADBE Transform Group").property("ADBE Position").setValue([1160, 540]);
  sq.property("ADBE Transform Group").property("ADBE Position").setValue([960, 540]);
  selectOnly(c, [sq, ci]);
  m = MC.merge();
  var top = sq.index < ci.index ? sq : ci, bottom = top === sq ? ci : sq;
  var troot = top.property("ADBE Root Vectors Group");
  ok("merge adds group", troot.numProperties === 2, m);
  ok("merge hides source", bottom.enabled === false);
  var moved = troot.property(2).property("ADBE Vector Transform Group").property("ADBE Vector Position").value;
  var expect = top === sq ? 200 : -200;
  ok("merge offsets group", near(moved[0], expect, 0.5), moved.join(","));
  ok("merge copies content", troot.property(2).property("ADBE Vectors Group").numProperties === 2, troot.property(2).property("ADBE Vectors Group").numProperties);

  ok("merge copies everything", m.indexOf("Not copied") < 0, m);
  selectOnly(c, [top]);
  var vm = "";
  try { MC.shapesFromVector(); } catch (e) { vm = e.message; }
  ok("vector command reaches engine", vm.indexOf("not a vector") >= 0, vm);
});

// ---- errors are friendly
attempt("errors", function () {
  selectOnly(c, []);
  var threw = "";
  try { MC.anchor(0, 0); } catch (e) { threw = e.message; }
  ok("no selection message", threw === "Select at least one layer.", threw);
});

$.writeln(results.join("\n"));
$.writeln((results.length - failed) + "/" + results.length + " passed");
