var Selection = require('../../lib/selection');
var Range = Selection.Range;
var TextOperation = require('../../lib/text-operation');

exports.testCreateCursor = function (test) {
  test.ok(Selection.createCursor(5).equals(new Selection([new Range(5, 5)])));
  test.done();
};

exports.testFromJSON = function (test) {
  var selection = Selection.fromJSON({ ranges: [{ anchor: 3, head: 5 }, { anchor: 11, head: 23 }] });
  test.ok(selection instanceof Selection);
  test.strictEqual(selection.ranges.length, 2);
  test.ok(selection.ranges[0].equals(new Range(3, 5)));
  test.ok(selection.ranges[1].equals(new Range(11, 23)));
  test.done();
};

exports.testSomethingSelected = function (test) {
  var selection = new Selection([new Range(7, 7), new Range(10,10)]);
  test.ok(!selection.somethingSelected());
  selection = new Selection([new Range(7, 10)]);
  test.ok(selection.somethingSelected());
  test.done();
};

exports.testTransform = function (test) {
  var selection = new Selection([new Range(3, 7), new Range(19, 21)]);
  test.ok(selection
    .transform(new TextOperation().retain(3).insert('lorem')['delete'](2).retain(42))
    .equals(new Selection([new Range(8, 10), new Range(22,24)])));
  test.ok(selection
    .transform(new TextOperation()['delete'](45))
    .equals(new Selection([new Range(0,0), new Range(0,0)])));
  test.done();
};

exports.testCompose = function (test) {
  var a = new Selection([new Range(3, 7)]);
  var b = Selection.createCursor(4);
  test.strictEqual(a.compose(b), b);
  test.done();
};