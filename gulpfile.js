'use strict';

const fs      = require('fs');
const path    = require('path');
const gulp    = require('gulp');
const buffer  = require('gulp-buffer');
const notify  = require('gulp-notify');
const growl   = require('gulp-notify-growl');
const jshint  = require('gulp-jshint');
const jscs    = require('gulp-jscs');
const watch   = require('gulp-watch');
const stylish = require('jshint-stylish');

const isWin = /^win/.test(process.platform);

function notice(config) {
  if (isWin) {
    config.notifier = growl();
  }

  return notify(config);
}

const paths = {js: '*.js'};

gulp.task('js:style', function() {
  return gulp.src(paths.js)
  .pipe(jscs())
  .pipe(notice({
    title: 'JSCS',
    message: 'JSCS Passed. Let it fly!',
    onLast: true
  }));
});

gulp.task('js:lint', function() {
  return gulp.src(paths.js)
  .pipe(jshint())
  .pipe(jshint.reporter(stylish))
  .pipe(notice({
    title: 'JSCS',
    message: 'JSCS Passed. Let it fly!',
    onLast: true
  }));
});

gulp.task('js:check', ['js:lint', 'js:style']);

gulp.task('watch', function() {
  gulp.watch(paths.js, ['js:check']);
});
