var operational_transformation = (function () {

  function Operation (ops) {
    this.ops = ops || [];
  }

  Operation.prototype.skip = function (n) {
    assert(n > 0);
    this.ops.push({ skip: n });
  };

  Operation.prototype.insert = function (str) {
    assert(str);
    this.ops.push({ insert: str });
  };

  Operation.prototype.delete = function (str) {
    assert(str);
    this.ops.push({ delete: str });
  };

  function apply (str, operation) {
    return str;
  }

  function compose (operation1, operation2) {
    return null;
  }

  function transform (operation1, operation2) {
    return null;
  }

  function assert (b) {
    if (!b) {
      throw new Error("Assertion error");
    }
  }

  return {
    Operation: Operation,
    apply: apply,
    compose: compose,
    transform: transform
  };

})();

if (typeof module === 'object') {
  module.exports = operational_transformation;
}