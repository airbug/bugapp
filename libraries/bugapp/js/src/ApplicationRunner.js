/*
 * Copyright (c) 2014 airbug Inc. All rights reserved.
 *
 * All software, both binary and source contained in this work is the exclusive property
 * of airbug Inc. Modification, decompilation, disassembly, or any other means of discovering
 * the source code of this software is prohibited. This work is protected under the United
 * States copyright law and other international copyright treaties and conventions.
 */


//-------------------------------------------------------------------------------
// Annotations
//-------------------------------------------------------------------------------

//@Export('bugapp.ApplicationRunner')

//@Require('Class')
//@Require('Exception')
//@Require('Obj')
//@Require('ParallelException')
//@Require('bugapp.Application')


//-------------------------------------------------------------------------------
// Context
//-------------------------------------------------------------------------------

require('bugpack').context("*", function(bugpack) {

    //-------------------------------------------------------------------------------
    // Common Modules
    //-------------------------------------------------------------------------------

    var domain                      = require("domain");

    //-------------------------------------------------------------------------------
    // BugPack
    //-------------------------------------------------------------------------------

    var Class               = bugpack.require('Class');
    var Obj     = bugpack.require('Obj');
    var Throwables   = bugpack.require('Throwables');
    var Application         = bugpack.require('bugapp.Application');


    //-------------------------------------------------------------------------------
    // Declare Class
    //-------------------------------------------------------------------------------

    /**
     * @class
     * @extends {Obj}
     */
    var ApplicationRunner = Class.extend(Obj, {

        _name: "bugapp.ApplicationRunner",


        //-------------------------------------------------------------------------------
        // Constructor
        //-------------------------------------------------------------------------------

        /**
         * @constructs
         * @param {Class} applicationClass
         * @param {Object} applicationOptions
         */
        _constructor: function(applicationClass, applicationOptions) {

            this._super();


            //-------------------------------------------------------------------------------
            // Private Properties
            //-------------------------------------------------------------------------------

            /**
             * @private
             * @type {Application}
             */
            this.application        = null;

            /**
             * @private
             * @type {Class}
             */
            this.applicationClass   = applicationClass;

            /**
             * @private
             * @type {domain}
             */
            this.applicationDomain  = null;

            /**
             * @private
             * @type {ParallelException}
             */
            this.applicationException = null;

            /**
             * @private
             * @type {Object}
             */
            this.applicationOptions   = applicationOptions;

            /**
             * @private
             * @type {boolean}
             */
            this.completeCalled = false;

            /**
             * @private
             * @type {boolean}
             */
            this.killTimerRunning = false;

            /**
             * @private
             * @type {function(Throwable=)}
             */
            this.runCallback          = null;

            /**
             * @private
             * @type {boolean}
             */
            this.runCalled        = false;
        },


        //-------------------------------------------------------------------------------
        // Getters and Setters
        //-------------------------------------------------------------------------------

        /**
         * @return {Application}
         */
        getApplication: function() {
            return this.application;
        },

        /**
         * @return {Class}
         */
        getApplicationClass: function() {
            return this.applicationClass;
        },

        /**
         * @return {domain}
         */
        getApplicationDomain: function() {
            return this.applicationDomain;
        },

        /**
         * @return {Object}
         */
        getApplicationOptions: function() {
            return this.applicationOptions;
        },

        /**
         * @return {boolean}
         */
        getKillTimerRunning: function() {
            return this.killTimerRunning;
        },

        /**
         * @return {function(Throwable=)}
         */
        getRunCallback: function() {
            return this.runCallback;
        },

        /**
         * @return {boolean}
         */
        getRunCalled: function() {
            return this.runCalled;
        },


        //-------------------------------------------------------------------------------
        // Convenience Methods
        //-------------------------------------------------------------------------------

        /**
         * @return {boolean}
         */
        isKillTimerRunning: function() {
            return this.killTimerRunning;
        },

        /**
         * @return {boolean}
         */
        wasRunCalled: function() {
            return this.runCalled;
        },


        //-------------------------------------------------------------------------------
        // Public Methods
        //-------------------------------------------------------------------------------

        /**
         * @param {function(Throwable=)} callback
         */
        run: function(callback) {
            if (!this.wasRunCalled()) {
                this.doRun(callback);
            } else {
                callback(Throwables.exception("IllegalState", {}, "Run already called on ApplicationRunner. Run may only be called once."));
            }
        },


        //-------------------------------------------------------------------------------
        // Private Methods
        //-------------------------------------------------------------------------------

        /**
         * @private
         * @param {Throwable=} throwable
         */
        completeRun: function(throwable) {
            if (throwable) {
                this.registerApplicationThrowable(throwable);
            }
            if (!this.completeCalled) {
                this.runCallback(this.applicationException);
            }
        },

        /**
         * @private
         */
        createApplication: function() {
            this.application = this.applicationClass.newInstance([this.applicationOptions]);
        },

        /**
         * @private
         */
        createApplicationDomain: function() {
            var _this = this;
            this.applicationDomain = domain.create();
            this.applicationDomain.on("error", function(error) {

                // Note: we're in dangerous territory!
                // By definition, something unexpected occurred,
                // which we probably didn"t want.
                // Anything can happen now!  Be very careful!


                _this.stopApplicationWithThrowable(error);
            });

            process.on("SIGINT", this.applicationDomain.bind(function() {
                _this.stopApplication();
            }));
            process.on("SIGTERM", this.applicationDomain.bind(function() {
                _this.stopApplication();
            }));
        },

        /**
         * @private
         * @param {function(Throwable=)} callback
         */
        doRun: function(callback) {
            this.runCallback = callback;
            this.createApplicationDomain();
            this.createApplication();
            this.startApplication();
        },

        /**
         * @private
         */
        doStopApplication: function() {
            try {
                this.application.stop();
            } catch(throwable) {
                this.completeRun(throwable);
            }
        },

        /**
         * @private
         * @param {Throwable} throwable
         */
        registerApplicationThrowable: function(throwable) {
            if (!this.applicationException) {
                this.applicationException = Throwables.parallelException("ApplicationException", {}, "An error occurred in the application");
            }
            this.applicationException.addCause(throwable);
        },

        /**
         * @private
         */
        stopApplication: function() {
            if (!this.application.isStopping()) {
                this.doStopApplication();
            } else {
                this.startKillTimer();
            }
        },

        /**
         * @private
         * @param {Throwable} throwable
         */
        stopApplicationWithThrowable: function(throwable) {
            this.registerApplicationThrowable(throwable);
            this.stopApplication();
            this.startKillTimer();
        },

        /**
         * @private
         */
        startApplication: function() {
            var _this = this;
            this.applicationDomain.run(function() {
                _this.application.addEventListener(Application.EventTypes.STARTED, function(event) {
                    //TODO BRN: Anything to do here?
                });
                _this.application.addEventListener(Application.EventTypes.STOPPED, function(event) {
                    _this.completeRun();
                });
                _this.application.addEventListener(Application.EventTypes.ERROR, function(event) {
                    var error = event.getData().error;
                    if (_this.application.isStarting()) {
                        _this.completeRun(Throwables.exception("ApplicationStartException", {}, "An exception occurred while the application was starting.", [error]))
                    } else if (_this.application.isStarted()) {
                        _this.stopApplicationWithThrowable(error);
                    } else if (_this.application.isStopping()) {
                        _this.stopApplicationWithThrowable(error);
                    } else {
                        _this.completeRun(error);
                    }
                });
                _this.application.start();
            });
        },

        /**
         * @private
         */
        startKillTimer: function() {
            var _this = this;
            if (!this.isKillTimerRunning()) {
                this.killTimerRunning = true;
                var killtimer = setTimeout(function () {
                    _this.completeRun(Throwables.exception("TimeOut", {}, "Application stop timed out."))
                }, 10000);
                killtimer.unref();
            }
        }
    });


    //-------------------------------------------------------------------------------
    // Exports
    //-------------------------------------------------------------------------------

    bugpack.export('bugapp.ApplicationRunner', ApplicationRunner);
});
