/*global module:false*/
module.exports = function(grunt) {

  // Project configuration.
  grunt.initConfig({
    pkg: '<json:package.json>',
    meta: {
      banner: [
        '/*',
        ' *    /\\',
        ' *   /  \\ <%= pkg.name %> <%= pkg.version %>',
        ' *  /    \\ <%= pkg.homepage || \'\' %>',
        ' *  \\    /',
        ' *   \\  / (c) <%= grunt.template.today("yyyy") %> <%= pkg.author %>',
        ' *    \\/ <%= pkg.name %> may be freely distributed under the MIT license.',
        ' */'
      ].join('\n')
    },
    lint: {
      files: ['grunt.js', 'lib/**/*.js', 'test/*.js', 'test/lib/*.js', 'test/phantomjs/test*.js']
    },
    test: {
      files: ['test/lib/*.js']
    },
    server: {
      port: 8000,
      base: '.'
    },
    qunit: {
      files: ['test/phantomjs/test.html']
    },
    concat: {
      dist: {
        src: [
          '<banner:meta.banner>',
          'lib/text-operation.js',
          'lib/cursor.js',
          'lib/wrapped-operation.js',
          'lib/undo-manager.js',
          'lib/client.js',
          'lib/codemirror-adapter.js',
          'lib/socketio-adapter.js',
          'lib/editor-client.js'
        ],
        dest: 'dist/ot.js'
      }
    },
    min: {
      dist: {
        src: ['<banner:meta.banner>', '<config:concat.dist.dest>'],
        dest: 'dist/ot-min.js'
      }
    },
    watch: {
      files: '<config:lint.files>',
      tasks: 'default'
    },
    jshint: {
      options: {
        curly: true,
        eqeqeq: true,
        immed: true,
        latedef: false,
        newcap: false, // there is a test that tests whether a constructor function can be called without new
        noarg: true,
        sub: true,
        undef: true,
        boss: true,
        eqnull: true,
        node: true,
        browser: true,
        strict: false
      },
      globals: {
        jQuery: true
      }
    },
    uglify: {}
  });

  // Default task.
  grunt.registerTask('default', 'lint test concat min qunit');

};
