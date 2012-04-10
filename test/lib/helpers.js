var Operation = require('../../lib/operation');

function randomInt (n) {
  return Math.floor(Math.random() * n);
}

function randomString (n) {
  var str = '';
  while (n--) {
    var chr = randomInt(26) + 97;
    str = str + String.fromCharCode(chr);
  }
  return str;
}

function randomOperation (operation, str) {
  if (!(operation instanceof Operation)) {
    operation = new Operation(operation);
  }
  var left;
  while (left = str.length - operation.baseLength) {
    var r = Math.random();
    var l = 1 + randomInt(Math.min(left, 20));
    if (r < 0.2) {
      operation.insert(randomString(l));
    } else if (r < 0.4) {
      operation.delete(str.slice(operation.baseLength, operation.baseLength + l));
    } else {
      operation.retain(l);
    }
  }
  if (Math.random() < 0.3) {
    operation.insert(1 + randomString(10));
  }
  return operation;
}

function randomElement (arr) {
  return arr[randomInt(arr.length)];
}

function assert (b, msg) {
  if (!b) {
    throw new Error(msg || "assertion error");
  }
}

function assertEqual (a, b) {
  if (a !== b) {
    throw new Error("assertion error: " + a + " !== " + b);
  }
}

function assertThrows (fn) {
  var threw = false;
  try {
    fn();
  } catch (exc) {
    threw = true;
  }
  assert(threw, "Expected function to throw an error");
}

function times (n, fun) {
  while (n--) {
    fun();
  }
}

exports.randomInt = randomInt;
exports.randomString = randomString;
exports.randomOperation = randomOperation;
exports.randomElement = randomElement;
exports.assert = assert;
exports.assertEqual = assertEqual;
exports.assertThrows = assertThrows;
exports.times = times;