/*
 * Copyright (c) 2015 airbug inc. http://airbug.com
 *
 * bugapp may be freely distributed under the MIT license.
 */


//-------------------------------------------------------------------------------
// Requires
//-------------------------------------------------------------------------------

var buildbug            = require('buildbug');


//-------------------------------------------------------------------------------
// Simplify References
//-------------------------------------------------------------------------------

var buildProject        = buildbug.buildProject;
var buildProperties     = buildbug.buildProperties;
var buildScript         = buildbug.buildScript;
var buildTarget         = buildbug.buildTarget;
var enableModule        = buildbug.enableModule;
var parallel            = buildbug.parallel;
var series              = buildbug.series;
var targetTask          = buildbug.targetTask;


//-------------------------------------------------------------------------------
// Enable Modules
//-------------------------------------------------------------------------------

var lintbug             = enableModule("lintbug");


//-------------------------------------------------------------------------------
// BuildProperties
//-------------------------------------------------------------------------------

buildProperties({
    lint: {
        targetPaths: [
            "."
        ],
        ignorePatterns: [
            ".*\\.buildbug$",
            ".*\\.bugunit$",
            ".*\\.git$",
            ".*node_modules$"
        ]
    }
});


//-------------------------------------------------------------------------------
// BuildFlows
//-------------------------------------------------------------------------------

var lintBuildFlow = targetTask('lint', {
    properties: {
        targetPaths: buildProject.getProperty("lint.targetPaths"),
        ignores: buildProject.getProperty("lint.ignorePatterns"),
        lintTasks: [
            "cleanupExtraSpacingAtEndOfLines",
            "ensureNewLineEnding",
            "indentEqualSignsForPreClassVars",
            "orderBugpackRequires",
            "orderRequireAnnotations",
            "updateCopyright"
        ]
    }
});


//-------------------------------------------------------------------------------
// BuildTargets
//-------------------------------------------------------------------------------


// Clean BuildTarget
//-------------------------------------------------------------------------------

buildTarget('clean').buildFlow(
    targetTask('clean')
);


// Lint BuildTarget
//-------------------------------------------------------------------------------

buildTarget('lint').buildFlow(
    lintBuildFlow
);


//-------------------------------------------------------------------------------
// Build Scripts
//-------------------------------------------------------------------------------

buildScript({
    dependencies: [
        "bugcore",
        "bugflow",
        "bugfs"
    ],
    script: "./lintbug.js"
});
