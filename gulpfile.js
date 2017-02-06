const gulp          = require('gulp');
const babel         = require('gulp-babel');
const concat        = require('gulp-concat');
const concatCss     = require('gulp-concat-css');
const rename        = require('gulp-rename');
const uglify        = require('gulp-uglify');
const cssNano       = require('gulp-cssnano');

// Concatenate & Minify src and dependencies
gulp.task('scripts', function() {
	return gulp.src([
		'src/js/L.CanvasLayer.js',
		'src/js/windy.js',
		'src/js/L.Control.WindPosition.js',
		'src/js/wind-js-leaflet.js'
	])
	.pipe(concat('wind-js-leaflet.js'))
	.pipe(babel({
		presets: ['es2015']
	}))
	.pipe(gulp.dest('dist'))
	.pipe(rename('wind-js-leaflet.min.js'))
	.pipe(uglify())
	.pipe(gulp.dest('dist'));
});

gulp.task('concatCss', function () {
	return gulp.src('./src/css/*.css')
		.pipe(concatCss('wind-js-leaflet.css'))
		.pipe(gulp.dest('./dist'));
});

gulp.task('cssNano', ['concatCss'], function() {
	gulp.src('./dist/wind-js-leaflet.css')
		.pipe(cssNano())
		.pipe(rename({suffix: '.min'}))
		.pipe(gulp.dest('./dist'));
});

// Default Task
gulp.task('default', ['scripts', 'concatCss', 'cssNano', 'watch']);

// Watch Files For Changes
gulp.task('watch', function() {
	// We watch both JS and HTML files.
	gulp.watch('src/js/*.js', ['scripts']);
	gulp.watch('src/css/*.css', ['concatCss', 'cssNano']);
});