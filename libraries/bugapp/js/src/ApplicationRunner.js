/*
 * Copyright (c) 2015 airbug inc. http://airbug.com
 *
 * bugapp may be freely distributed under the MIT license.
 */


//-------------------------------------------------------------------------------
// Annotations
//-------------------------------------------------------------------------------

//@Export('bugapp.ApplicationRunner')

//@Require('Class')
//@Require('EventDispatcher')
//@Require('Throwables')
//@Require('bugapp.Application')


//-------------------------------------------------------------------------------
// Context
//-------------------------------------------------------------------------------

require('bugpack').context("*", function(bugpack) {

    //-------------------------------------------------------------------------------
    // Common Modules
    //-------------------------------------------------------------------------------

    var domain              = require("domain");

    //-------------------------------------------------------------------------------
    // BugPack
    //-------------------------------------------------------------------------------

    var Class               = bugpack.require('Class');
    var EventDispatcher     = bugpack.require('EventDispatcher');
    var Throwables          = bugpack.require('Throwables');
    var Application         = bugpack.require('bugapp.Application');


    //-------------------------------------------------------------------------------
    // Declare Class
    //-------------------------------------------------------------------------------

    /**
     * @class
     * @extends {Obj}
     */
    var ApplicationRunner = Class.extend(EventDispatcher, {

        _name: "bugapp.ApplicationRunner",


        //-------------------------------------------------------------------------------
        // Constructor
        //-------------------------------------------------------------------------------

        /**
         * @constructs
         */
        _constructor: function() {

            this._super();


            //-------------------------------------------------------------------------------
            // Private Properties
            //-------------------------------------------------------------------------------

            /**
             * @private
             * @type {Application}
             */
            this.application            = null;

            /**
             * @private
             * @type {Class}
             */
            this.applicationClass       = null;

            /**
             * @private
             * @type {domain}
             */
            this.applicationDomain      = null;

            /**
             * @private
             * @type {ParallelException}
             */
            this.applicationException   = null;

            /**
             * @private
             * @type {Object}
             */
            this.applicationOptions     = {};

            /**
             * @private
             * @type {boolean}
             */
            this.completeCalled         = false;

            /**
             * @private
             * @type {boolean}
             */
            this.killTimerRunning       = false;

            /**
             * @private
             * @type {function(Throwable=)}
             */
            this.runCallback            = null;

            /**
             * @private
             * @type {boolean}
             */
            this.runCalled              = false;
        },


        //-------------------------------------------------------------------------------
        // Init Methods
        //-------------------------------------------------------------------------------

        /**
         * @param {Class} applicationClass
         * @return {ApplicationRunner}
         */
        initWithClass: function(applicationClass) {
            this.init();
            this.applicationClass = applicationClass;
            return this;
        },

        /**
         * @param {Class} applicationClass
         * @param {Object} applicationOptions
         * @return {ApplicationRunner}
         */
        initWithClassAndOptions: function(applicationClass, applicationOptions) {
            this.init();
            this.applicationClass = applicationClass;
            this.applicationOptions = applicationOptions;
            return this;
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
            this.application = this.applicationClass.newInstance(this.applicationOptions);
            this.application.setParentPropagator(this);
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
