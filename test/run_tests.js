#!/usr/bin/env node

var operational_transformation_tests = require('./operational-transformation');
var client_tests = require('./client');

function main () {
  operational_transformation_tests.run();
  client_tests.run();
}

main();