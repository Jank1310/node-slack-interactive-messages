'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.SlackMessageAdapter = undefined;

var _slicedToArray = function () { function sliceIterator(arr, i) { var _arr = []; var _n = true; var _d = false; var _e = undefined; try { for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) { _arr.push(_s.value); if (i && _arr.length === i) break; } } catch (err) { _d = true; _e = err; } finally { try { if (!_n && _i["return"]) _i["return"](); } finally { if (_d) throw _e; } } return _arr; } return function (arr, i) { if (Array.isArray(arr)) { return arr; } else if (Symbol.iterator in Object(arr)) { return sliceIterator(arr, i); } else { throw new TypeError("Invalid attempt to destructure non-iterable instance"); } }; }();

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }(); /**
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      * @module adapter
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      */

var _http = require('http');

var _http2 = _interopRequireDefault(_http);

var _axios = require('axios');

var _axios2 = _interopRequireDefault(_axios);

var _lodash = require('lodash.isstring');

var _lodash2 = _interopRequireDefault(_lodash);

var _lodash3 = require('lodash.isplainobject');

var _lodash4 = _interopRequireDefault(_lodash3);

var _lodash5 = require('lodash.isregexp');

var _lodash6 = _interopRequireDefault(_lodash5);

var _lodash7 = require('lodash.isfunction');

var _lodash8 = _interopRequireDefault(_lodash7);

var _debug = require('debug');

var _debug2 = _interopRequireDefault(_debug);

var _httpHandler = require('./http-handler');

var _util = require('./util');

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var debug = (0, _debug2.default)('@slack/interactive-messages:adapter');

/**
 * Transforms various forms of matching constraints to a single standard object shape
 * @param {string|RegExp|Object} matchingConstraints - the various forms of matching constraints
 * accepted
 * @returns {Object} - an object where each matching constraint is a property
 * @private
 */
function formatMatchingConstraints(matchingConstraints) {
  var ret = {};
  if (typeof matchingConstraints === 'undefined' || matchingConstraints === null) {
    throw new TypeError('Constraints cannot be undefined or null');
  }
  if (!(0, _lodash4.default)(matchingConstraints)) {
    ret.callbackId = matchingConstraints;
  } else {
    ret = Object.assign({}, matchingConstraints);
  }
  return ret;
}

/**
 * Validates general properties of a matching constraints object
 * @param {Object} matchingConstraints - object describing the constraints on a callback
 * @returns {Error|false} - a false value represents successful validation, otherwise an error to
 * describe why validation failed.
 * @private
 */
function validateConstraints(matchingConstraints) {
  if (matchingConstraints.callbackId && !((0, _lodash2.default)(matchingConstraints.callbackId) || (0, _lodash6.default)(matchingConstraints.callbackId))) {
    return new TypeError('Callback ID must be a string or RegExp');
  }

  if (matchingConstraints.blockId && !((0, _lodash2.default)(matchingConstraints.blockId) || (0, _lodash6.default)(matchingConstraints.blockId))) {
    return new TypeError('Block ID must be a string or RegExp');
  }

  if (matchingConstraints.actionId && !((0, _lodash2.default)(matchingConstraints.actionId) || (0, _lodash6.default)(matchingConstraints.actionId))) {
    return new TypeError('Action ID must be a string or RegExp');
  }

  return false;
}

/**
 * Validates properties of a matching constraints object specific to registering an options request
 * @param {Object} matchingConstraints - object describing the constraints on a callback
 * @returns {Error|false} - a false value represents successful validation, otherwise an error to
 * describe why validation failed.
 * @private
 */
function validateOptionsConstraints(optionsConstraints) {
  if (optionsConstraints.within && !(optionsConstraints.within === 'interactive_message' || optionsConstraints.within === 'block_actions' || optionsConstraints.within === 'dialog')) {
    return new TypeError('Within must be \'block_actions\', \'interactive_message\' or \'dialog\'');
  }

  // We don't need to validate unfurl, we'll just cooerce it to a boolean
  return false;
}

/**
 * An adapter for Slack's interactive message components such as buttons, menus, and dialogs.
 * @typicalname slackInteractions
 */

var SlackMessageAdapter = exports.SlackMessageAdapter = function () {
  /**
   * Create a message adapter.
   *
   * @param {string} signingSecret - Slack app signing secret used to authenticate request
   * @param {Object} [options]
   * @param {number} [options.syncResponseTimeout=2500] - number of milliseconds to wait before
   * flushing a syncrhonous response to an incoming request and falling back to an asynchronous
   * response.
   * @param {boolean} [options.lateResponseFallbackEnabled=true] - whether or not promises that
   * resolve after the syncResponseTimeout can fallback to a request for the response_url. this only
   * works in cases where the semantic meaning of the response and the response_url are the same.
   */
  function SlackMessageAdapter(signingSecret) {
    var _ref = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {},
        _ref$syncResponseTime = _ref.syncResponseTimeout,
        syncResponseTimeout = _ref$syncResponseTime === undefined ? 2500 : _ref$syncResponseTime,
        _ref$lateResponseFall = _ref.lateResponseFallbackEnabled,
        lateResponseFallbackEnabled = _ref$lateResponseFall === undefined ? true : _ref$lateResponseFall;

    _classCallCheck(this, SlackMessageAdapter);

    if (!(0, _lodash2.default)(signingSecret)) {
      throw new TypeError('SlackMessageAdapter needs a signing secret');
    }

    if (syncResponseTimeout > 3000 || syncResponseTimeout < 1) {
      throw new TypeError('syncResponseTimeout must be between 1 and 3000');
    }

    this.signingSecret = signingSecret;
    this.syncResponseTimeout = syncResponseTimeout;
    this.lateResponseFallbackEnabled = lateResponseFallbackEnabled;
    this.callbacks = [];
    this.axios = _axios2.default.create({
      headers: {
        'User-Agent': (0, _util.packageIdentifier)()
      }
    });

    debug('instantiated');
  }

  /* Interface for using the built-in server */

  /**
   * Create a server that dispatches Slack's interactive message actions and menu requests to this
   * message adapter instance. Use this method if your application will handle starting the server.
   *
   * @param {string} [path=/slack/actions] - The path portion of the URL where the server will
   * listen for requests from Slack's interactive messages.
   * @returns {Promise<NodeHttpServer>} - A promise that resolves to an instance of http.Server and
   * will dispatch interactive message actions and options requests to this message adapter
   * instance. https://nodejs.org/dist/latest/docs/api/http.html#http_class_http_server
   */


  _createClass(SlackMessageAdapter, [{
    key: 'createServer',
    value: function createServer() {
      var _this = this;

      var path = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : '/slack/actions';

      // TODO: more options (like https)
      return Promise.resolve().then(function () {
        debug('server created - path: %s', path);

        return _http2.default.createServer(_this.requestListener());
      });
    }

    /**
     * Start a built-in server that dispatches Slack's interactive message actions and menu requests
     * to this message adapter interface.
     *
     * @param {number} port
     * @returns {Promise<void>} - A promise that resolves once the server is ready
     */

  }, {
    key: 'start',
    value: function start(port) {
      var _this2 = this;

      return this.createServer().then(function (server) {
        return new Promise(function (resolve, reject) {
          _this2.server = server;
          server.on('error', reject);
          server.listen(port, function () {
            return resolve(server);
          });
          debug('server started - port: %s', port);
        });
      });
    }

    /**
     * Stop the previously started built-in server.
     *
     * @returns {Promise<void>} - A promise that resolves once the server is cleaned up.
     */

  }, {
    key: 'stop',
    value: function stop() {
      var _this3 = this;

      return new Promise(function (resolve, reject) {
        if (_this3.server) {
          _this3.server.close(function (error) {
            delete _this3.server;
            if (error) {
              reject(error);
            } else {
              resolve();
            }
          });
        } else {
          reject(new Error('SlackMessageAdapter cannot stop when it did not start a server'));
        }
      });
    }

    /* Interface for bringing your own server */

    /**
     * Create a middleware function that can be used to integrate with the `express` web framework
     * in order for incoming requests to be dispatched to this message adapter instance.
     *
     * @returns {ExpressMiddlewareFunc} - A middleware function http://expressjs.com/en/guide/using-middleware.html
     */

  }, {
    key: 'expressMiddleware',
    value: function expressMiddleware() {
      var requestListener = this.requestListener();
      return function (req, res) {
        requestListener(req, res);
      };
    }

    /**
     * Create a request listener function that handles HTTP requests, verifies requests
     * and dispatches responses
     *
     * @returns {slackRequestListener}
     */

  }, {
    key: 'requestListener',
    value: function requestListener() {
      return (0, _httpHandler.createHTTPHandler)(this);
    }

    /* Interface for adding handlers */

    /* eslint-disable max-len */
    /**
     * Add a handler for an interactive message action.
     *
     * Usually there's no need to be concerned with _how_ a message is sent to Slack, but the
     * following table describes it fully.
     *
     * **Action**|**Return `object`**|**Return `Promise<object>`**|**Return `undefined`**|**Call `respond(message)`**|**Notes**
     * :-----:|:-----:|:-----:|:-----:|:-----:|:-----:
     * **Button Press**| Message in response | When resolved before `syncResposeTimeout` or `lateResponseFallbackEnabled: false`, message in response<br />When resolved after `syncResponseTimeout` and `lateResponseFallbackEnabled: true`, message in request to `response_url` | Empty response | Message in request to `response_url` | Create a new message instead of replacing using `replace_original: false`
     * **Menu Selection**| Message in response | When resolved before `syncResposeTimeout` or `lateResponseFallbackEnabled: false`, message in response<br />When resolved after `syncResponseTimeout` and `lateResponseFallbackEnabled: true`, message in request to `response_url` | Empty response | Message in request to `response_url` | Create a new message instead of replacing using `replace_original: false`
     * **Message Action** | Message in response | When resolved before `syncResposeTimeout` or `lateResponseFallbackEnabled: false`, message in response<br />When resolved after `syncResponseTimeout` and `lateResponseFallbackEnabled: true`, message in request to `response_url` | Empty response | Message in request to `response_url` |
     * **Dialog Submission**| Error list in response | Error list in response | Empty response | Message in request to `response_url` | Returning a Promise that takes longer than 3 seconds to resolve can result in the user seeing an error. Warning logged if a promise isn't completed before `syncResponseTimeout`.
     *
     * @param {Object|string|RegExp} matchingConstraints - the callback ID (as a string or RegExp) or
     * an object describing the constraints to match actions for the handler.
     * @param {string|RegExp} [matchingConstraints.callbackId] - a string or RegExp to match against
     * the `callback_id`
     * @param {string|RegExp} [matchingConstraints.blockId] - a string or RegExp to match against
     * the `block_id`
     * @param {string|RegExp} [matchingConstraints.actionId] - a string or RegExp to match against
     * the `action_id`
     * @param {string} [matchingConstraints.type] - valid types include all
     * [actions block elements](https://api.slack.com/reference/messaging/interactive-components),
     * `select` only for menu selections, or `dialog_submission` only for dialog submissions
     * @param {boolean} [matchingConstraints.unfurl] - when `true` only match actions from an unfurl
     * @param {module:adapter~SlackMessageAdapter~ActionHandler} callback - the function to run when
     * an action is matched
     * @returns {module:adapter~SlackMessageAdapter} - this instance (for chaining)
     */

  }, {
    key: 'action',
    value: function action(matchingConstraints, callback) {
      /* eslint-enable max-len */
      var actionConstraints = formatMatchingConstraints(matchingConstraints);
      actionConstraints.handlerType = 'action';

      var error = validateConstraints(actionConstraints);
      if (error) {
        debug('action could not be registered: %s', error.message);
        throw error;
      }

      return this.registerCallback(actionConstraints, callback);
    }

    /* eslint-disable max-len */
    /**
     * Add a handler for an options request
     *
     * Usually there's no need to be concerned with _how_ a message is sent to Slack, but the
     * following table describes it fully
     *
     * &nbsp;|**Return `options`**|**Return `Promise<options>`**|**Return `undefined`**|**Notes**
     * :-----:|:-----:|:-----:|:-----:|:-----:
     * **Options Request**| Options in response | Options in response | Empty response | Returning a Promise that takes longer than 3 seconds to resolve can result in the user seeing an error. If the request is from within a dialog, the `text` field is called `label`.
     *
     * @param {object} matchingConstraints - the callback ID (as a string or RegExp) or
     * an object describing the constraints to select options requests for the handler.
     * @param {string|RegExp} [matchingConstraints.callbackId] - a string or RegExp to match against
     * the `callback_id`
     * @param {string|RegExp} [matchingConstraints.blockId] - a string or RegExp to match against
     * the `block_id`
     * @param {string|RegExp} [matchingConstraints.actionId] - a string or RegExp to match against
     * the `action_id`
     * @param {string} [matchingConstraints.within] - `block_actions` only for external select
     * in actions block, `interactive_message` only for menus in an interactive message, or
     * `dialog` only for menus in a dialog
     * @param {module:adapter~SlackMessageAdapter~OptionsHandler} callback - the function to run when
     * an options request is matched
     * @returns {module:adapter~SlackMessageAdapter} - this instance (for chaining)
     */

  }, {
    key: 'options',
    value: function options(matchingConstraints, callback) {
      /* eslint-enable max-len */
      var optionsConstraints = formatMatchingConstraints(matchingConstraints);
      optionsConstraints.handlerType = 'options';

      var error = validateConstraints(optionsConstraints) || validateOptionsConstraints(optionsConstraints);
      if (error) {
        debug('options could not be registered: %s', error.message);
        throw error;
      }

      return this.registerCallback(optionsConstraints, callback);
    }

    /* Interface for HTTP servers (like express middleware) */

    /**
     * Dispatches the contents of an HTTP request to the registered handlers.
     *
     * @param {object} payload
     * @returns {Promise<{ status: number, content: object|string|undefined }>|undefined} - A promise
     * of the response information (an object with status and content that is a JSON serializable
     * object or a string or undefined) for the request. An undefined return value indicates that the
     * request was not matched.
     * @private
     */

  }, {
    key: 'dispatch',
    value: function dispatch(payload) {
      var _this4 = this;

      var callback = this.matchCallback(payload);
      if (!callback) {
        debug('dispatch could not find a handler');
        return undefined;
      }
      debug('dispatching to handler');

      var _callback = _slicedToArray(callback, 2),
          callbackFn = _callback[1];

      // when a response_url is present,`respond()` function created to to send a message using it


      var respond = void 0;
      if (payload.response_url) {
        respond = function respond(message) {
          if (typeof message.then === 'function') {
            throw new TypeError('Cannot use a Promise as the parameter for respond()');
          }
          debug('sending async response');
          return _this4.axios.post(payload.response_url, message);
        };
      }

      var callbackResult = void 0;
      try {
        callbackResult = callbackFn.call(this, payload, respond);
      } catch (error) {
        debug('callback error: %o', error);
        return Promise.resolve({ status: 500 });
      }

      if (callbackResult) {
        return (0, _util.promiseTimeout)(this.syncResponseTimeout, callbackResult).then(function (content) {
          return { status: 200, content };
        }).catch(function (error) {
          if (error.code === _util.errorCodes.PROMISE_TIMEOUT) {
            // warn and continue for promises that cannot be saved with a later async response.
            // this includes dialog submissions because the response_url doesn't have the same
            // semantics as the response, any request that doesn't contain a response_url, and
            // if this has been explicitly disabled in the configuration.
            if (!_this4.lateResponseFallbackEnabled || !respond || payload.type === 'dialog_submission') {
              debug('WARNING: The response Promise did not resolve under the timeout.');
              return callbackResult.then(function (content) {
                return { status: 200, content };
              }).catch(function () {
                return { status: 500 };
              });
            }

            // save a late promise by sending an empty body in the response, and then use the
            // response_url to send the eventually resolved value
            callbackResult.then(respond).catch(function (callbackError) {
              // when the promise is late and fails, we cannot do anything but log it
              debug('ERROR: Promise was late and failed. Use `.catch()` to handle errors.');
              throw callbackError;
            });
            return { status: 200 };
          }

          return { status: 500 };
        });
      }

      // The following result value represents:
      // * "no replacement" for message actions
      // * "submission is valid" for dialog submissions
      // * "no suggestions" for menu options TODO: check that this is true
      return Promise.resolve({ status: 200 });
    }

    /**
     * @private
     */

  }, {
    key: 'registerCallback',
    value: function registerCallback(constraints, callback) {
      // Validation
      if (!(0, _lodash8.default)(callback)) {
        debug('did not register callback because its not a function');
        throw new TypeError('callback must be a function');
      }

      this.callbacks.push([constraints, callback]);

      return this;
    }

    /**
     * @private
     */

  }, {
    key: 'matchCallback',
    value: function matchCallback(payload) {
      return this.callbacks.find(function (_ref2) {
        var _ref3 = _slicedToArray(_ref2, 1),
            constraints = _ref3[0];

        // if the callback ID constraint is specified, only continue if it matches
        if (constraints.callbackId) {
          if ((0, _lodash2.default)(constraints.callbackId) && payload.callback_id !== constraints.callbackId) {
            return false;
          }
          if ((0, _lodash6.default)(constraints.callbackId) && !constraints.callbackId.test(payload.callback_id)) {
            return false;
          }
        }

        // if the action constraint is specified, only continue if it matches
        if (constraints.handlerType === 'action') {
          // a payload that represents an action either has actions, submission, or message defined
          if (!(payload.actions || payload.submission || payload.message)) {
            return false;
          }

          // dialog submissions don't have an action defined, so an empty action is substituted for
          // the purpose of callback matching
          var action = payload.actions ? payload.actions[0] : {};

          // if the block ID constraint is specified, only continue if it matches
          if (constraints.blockId) {
            if ((0, _lodash2.default)(constraints.blockId) && action.block_id !== constraints.blockId) {
              return false;
            }
            if ((0, _lodash6.default)(constraints.blockId) && !constraints.blockId.test(action.block_id)) {
              return false;
            }
          }

          // if the action ID constraint is specified, only continue if it matches
          if (constraints.actionId) {
            if ((0, _lodash2.default)(constraints.actionId) && action.action_id !== constraints.actionId) {
              return false;
            }
            if ((0, _lodash6.default)(constraints.actionId) && !constraints.actionId.test(action.action_id)) {
              return false;
            }
          }

          // button and message actions have a type defined inside the action, dialog submission
          // actions have a type defined at the top level, and select actions don't have a type
          // defined, but type can be inferred by checking if a `selected_options` property exists in
          // the action.
          var type = action.type || payload.type || action.selected_options && 'select';
          if (!type) {
            debug('no type found in dispatched action');
          }
          // if the type constraint is specified, only continue if it matches
          if (constraints.type && constraints.type !== type) {
            return false;
          }

          // if the unfurl constraint is specified, only continue if it matches
          if ('unfurl' in constraints && (constraints.unfurl && !payload.is_app_unfurl || !constraints.unfurl && payload.is_app_unfurl)) {
            return false;
          }
        }

        if (constraints.handlerType === 'options') {
          // a payload that represents an options request in attachments always has a name defined
          // at the top level. in blocks the type is block_suggestion and has no name
          if (!('name' in payload || payload.type && payload.type === 'block_suggestion')) {
            return false;
          }

          // if the block ID constraint is specified, only continue if it matches
          if (constraints.blockId) {
            if ((0, _lodash2.default)(constraints.blockId) && payload.block_id !== constraints.blockId) {
              return false;
            }
            if ((0, _lodash6.default)(constraints.blockId) && !constraints.blockId.test(payload.block_id)) {
              return false;
            }
          }

          // if the action ID constraint is specified, only continue if it matches
          if (constraints.actionId) {
            if ((0, _lodash2.default)(constraints.actionId) && payload.action_id !== constraints.actionId) {
              return false;
            }
            if ((0, _lodash6.default)(constraints.actionId) && !constraints.actionId.test(payload.action_id)) {
              return false;
            }
          }

          // an options request always has a type at the top level which can be one of three values
          // that need to be mapped into the values for the `within` constraint:
          // * type:interactive_message => within:interactive_message
          // * type:block_suggestion => within:block_actions
          // * type:dialog_suggestion => within:dialog
          if (constraints.within) {
            if (constraints.within === 'interactive_message' && payload.type !== 'interactive_message') {
              return false;
            }
            if (constraints.within === 'block_actions' && payload.type !== 'block_suggestion') {
              return false;
            }
            if (constraints.within === 'dialog' && payload.type !== 'dialog_suggestion') {
              return false;
            }
          }
        }

        // if there's no reason to eliminate this callback, then its a match!
        return true;
      });
    }
  }]);

  return SlackMessageAdapter;
}();

/**
 * @alias module:adapter
 */


exports.default = SlackMessageAdapter;

/**
 * @external ExpressMiddlewareFunc
 * @see http://expressjs.com/en/guide/using-middleware.html
 */

/**
 * @external NodeHttpServer
 * @see https://nodejs.org/dist/latest/docs/api/http.html#http_class_http_server
 */

/**
 * A handler function for action requests (block actions, button presses, menu selections,
 * and dialog submissions).
 *
 * @name module:adapter~SlackMessageAdapter~ActionHandler
 * @function
 * @param {Object} payload - an object describing the
 * [block actions](https://api.slack.com/messaging/interactivity/enabling#understanding-payloads)
 * [button press](https://api.slack.com/docs/message-buttons#responding_to_message_actions),
 * [menu selection](https://api.slack.com/docs/message-menus#request_url_response), or
 * [dialog submission](https://api.slack.com/dialogs#evaluating_submission_responses).
 * @param {module:adapter~SlackMessageAdapter~ActionHandler~Respond} respond - When the action is a
 * button press or menu selection, this function is used to update the message where the action
 * occured or create new messages in the same conversation. When the action is a dialog submission,
 * this function is used to create new messages in the conversation where the dialog was triggered.
 * @returns {Object} When the action is a button press or a menu selection, this object is a
 * replacement
 * [message](https://api.slack.com/docs/interactive-message-field-guide#top-level_message_fields)
 * for the message in which the action occurred. It may also be a Promise for a message, and if so
 * and the Promise takes longer than the `syncResponseTimeout` to complete, the message is sent over
 * the `response_url`. The message may also be a new message in the same conversation by setting
 * `replace_original: false`. When the action is a dialog submission, this object is a list of
 * [validation errors](https://api.slack.com/dialogs#input_validation). It may also be a Promise for
 * a list of validation errors, and if so and the Promise takes longer than the
 * `syncReponseTimeout` to complete, Slack will disply an error to the user. If there is no return
 * value, then button presses and menu selections do not update the message and dialog submissions
 * will validate and dismiss.
 */

/**
 * A function used to send message updates after an action is handled. This function can be used
 * up to 5 times in 30 minutes.
 *
 * @name module:adapter~SlackMessageAdapter~ActionHandler~Respond
 * @function
 * @param {Object} message - a
 * [message](https://api.slack.com/docs/interactive-message-field-guide#top-level_message_fields).
 * Dialog submissions do not allow `resplace_original: false` on this message.
 * @returns {Promise} there's no contract or interface for the resolution value, but this Promise
 * will resolve when the HTTP response from the `response_url` request is complete and reject when
 * there is an error.
 */

/**
 * A handler function for menu options requests.
 *
 * @name module:adapter~SlackMessageAdapter~OptionsHandler
 * @function
 * @param {Object} payload - an object describing
 * [the state of the menu](https://api.slack.com/docs/message-menus#options_load_url)
 * @returns {Object} an
 * [options list](https://api.slack.com/docs/interactive-message-field-guide#option_fields) or
 * [option groups list](https://api.slack.com/docs/interactive-message-field-guide#option_groups).
 * When the menu is within an interactive message, (`within: 'interactive_message'`) the option
 * keys are `text` and `value`. When the menu is within a dialog (`within: 'dialog'`) the option
 * keys are `label` and `value`. When the menu is within a dialog (`within: 'block_actions'`) the
 * option keys are a text block and `value`. This function may also return a Promise either of
 * these values. If a Promise is returned and it does not complete within 3 seconds, Slack will
 * display an error to the user. If there is no return value, then the user is shown an empty list
 * of options.
 */
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uL3NyYy9hZGFwdGVyLmpzIl0sIm5hbWVzIjpbImRlYnVnIiwiZm9ybWF0TWF0Y2hpbmdDb25zdHJhaW50cyIsIm1hdGNoaW5nQ29uc3RyYWludHMiLCJyZXQiLCJUeXBlRXJyb3IiLCJjYWxsYmFja0lkIiwiT2JqZWN0IiwiYXNzaWduIiwidmFsaWRhdGVDb25zdHJhaW50cyIsImJsb2NrSWQiLCJhY3Rpb25JZCIsInZhbGlkYXRlT3B0aW9uc0NvbnN0cmFpbnRzIiwib3B0aW9uc0NvbnN0cmFpbnRzIiwid2l0aGluIiwiU2xhY2tNZXNzYWdlQWRhcHRlciIsInNpZ25pbmdTZWNyZXQiLCJzeW5jUmVzcG9uc2VUaW1lb3V0IiwibGF0ZVJlc3BvbnNlRmFsbGJhY2tFbmFibGVkIiwiY2FsbGJhY2tzIiwiYXhpb3MiLCJjcmVhdGUiLCJoZWFkZXJzIiwicGF0aCIsIlByb21pc2UiLCJyZXNvbHZlIiwidGhlbiIsImh0dHAiLCJjcmVhdGVTZXJ2ZXIiLCJyZXF1ZXN0TGlzdGVuZXIiLCJwb3J0IiwicmVqZWN0Iiwic2VydmVyIiwib24iLCJsaXN0ZW4iLCJjbG9zZSIsImVycm9yIiwiRXJyb3IiLCJyZXEiLCJyZXMiLCJjYWxsYmFjayIsImFjdGlvbkNvbnN0cmFpbnRzIiwiaGFuZGxlclR5cGUiLCJtZXNzYWdlIiwicmVnaXN0ZXJDYWxsYmFjayIsInBheWxvYWQiLCJtYXRjaENhbGxiYWNrIiwidW5kZWZpbmVkIiwiY2FsbGJhY2tGbiIsInJlc3BvbmQiLCJyZXNwb25zZV91cmwiLCJwb3N0IiwiY2FsbGJhY2tSZXN1bHQiLCJjYWxsIiwic3RhdHVzIiwiY29udGVudCIsImNhdGNoIiwiY29kZSIsInV0aWxFcnJvckNvZGVzIiwiUFJPTUlTRV9USU1FT1VUIiwidHlwZSIsImNhbGxiYWNrRXJyb3IiLCJjb25zdHJhaW50cyIsInB1c2giLCJmaW5kIiwiY2FsbGJhY2tfaWQiLCJ0ZXN0IiwiYWN0aW9ucyIsInN1Ym1pc3Npb24iLCJhY3Rpb24iLCJibG9j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Ozs7Ozs7Ozs7O0FBNkJBOzs7Ozs7Ozs7Ozs7OztBQWNBIiwiZmlsZSI6ImFkYXB0ZXIuanMiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIEBtb2R1bGUgYWRhcHRlclxuICovXG5cbmltcG9ydCBodHRwIGZyb20gJ2h0dHAnO1xuaW1wb3J0IGF4aW9zIGZyb20gJ2F4aW9zJztcbmltcG9ydCBpc1N0cmluZyBmcm9tICdsb2Rhc2guaXNzdHJpbmcnO1xuaW1wb3J0IGlzUGxhaW5PYmplY3QgZnJvbSAnbG9kYXNoLmlzcGxhaW5vYmplY3QnO1xuaW1wb3J0IGlzUmVnRXhwIGZyb20gJ2xvZGFzaC5pc3JlZ2V4cCc7XG5pbXBvcnQgaXNGdW5jdGlvbiBmcm9tICdsb2Rhc2guaXNmdW5jdGlvbic7XG5pbXBvcnQgZGVidWdGYWN0b3J5IGZyb20gJ2RlYnVnJztcbmltcG9ydCB7IGNyZWF0ZUhUVFBIYW5kbGVyIH0gZnJvbSAnLi9odHRwLWhhbmRsZXInO1xuaW1wb3J0IHsgcGFja2FnZUlkZW50aWZpZXIsIHByb21pc2VUaW1lb3V0LCBlcnJvckNvZGVzIGFzIHV0aWxFcnJvckNvZGVzIH0gZnJvbSAnLi91dGlsJztcblxuY29uc3QgZGVidWcgPSBkZWJ1Z0ZhY3RvcnkoJ0BzbGFjay9pbnRlcmFjdGl2ZS1tZXNzYWdlczphZGFwdGVyJyk7XG5cblxuLyoqXG4gKiBUcmFuc2Zvcm1zIHZhcmlvdXMgZm9ybXMgb2YgbWF0Y2hpbmcgY29uc3RyYWludHMgdG8gYSBzaW5nbGUgc3RhbmRhcmQgb2JqZWN0IHNoYXBlXG4gKiBAcGFyYW0ge3N0cmluZ3xSZWdFeHB8T2JqZWN0fSBtYXRjaGluZ0NvbnN0cmFpbnRzIC0gdGhlIHZhcmlvdXMgZm9ybXMgb2YgbWF0Y2hpbmcgY29uc3RyYWludHNcbiAqIGFjY2VwdGVkXG4gKiBAcmV0dXJucyB7T2JqZWN0fSAtIGFuIG9iamVjdCB3aGVyZSBlYWNoIG1hdGNoaW5nIGNvbnN0cmFpbnQgaXMgYSBwcm9wZXJ0eVxuICogQHByaXZhdGVcbiAqL1xuZnVuY3Rpb24gZm9ybWF0TWF0Y2hpbmdDb25zdHJhaW50cyhtYXRjaGluZ0NvbnN0cmFpbnRzKSB7XG4gIGxldCByZXQgPSB7fTtcbiAgaWYgKHR5cGVvZiBtYXRjaGluZ0NvbnN0cmFpbnRzID09PSAndW5kZWZpbmVkJyB8fCBtYXRjaGluZ0NvbnN0cmFpbnRzID09PSBudWxsKSB7XG4gICAgdGhyb3cgbmV3IFR5cGVFcnJvcignQ29uc3RyYWludHMgY2Fubm90IGJlIHVuZGVmaW5lZCBvciBudWxsJyk7XG4gIH1cbiAgaWYgKCFpc1BsYWluT2JqZWN0KG1hdGNoaW5nQ29uc3RyYWludHMpKSB7XG4gICAgcmV0LmNhbGxiYWNrSWQgPSBtYXRjaGluZ0NvbnN0cmFpbnRzO1xuICB9IGVsc2Uge1xuICAgIHJldCA9IE9iamVjdC5hc3NpZ24oe30sIG1hdGNoaW5nQ29uc3RyYWludHMpO1xuICB9XG4gIHJldHVybiByZXQ7XG59XG5cbi8qKlxuICogVmFsaWRhdGVzIGdlbmVyYWwgcHJvcGVydGllcyBvZiBhIG1hdGNoaW5nIGNvbnN0cmFpbnRzIG9iamVjdFxuICogQHBhcmFtIHtPYmplY3R9IG1hdGNoaW5nQ29uc3RyYWludHMgLSBvYmplY3QgZGVzY3JpYmluZyB0aGUgY29uc3RyYWludHMgb24gYSBjYWxsYmFja1xuICogQHJldHVybnMge0Vycm9yfGZhbHNlfSAtIGEgZmFsc2UgdmFsdWUgcmVwcmVzZW50cyBzdWNjZXNzZnVsIHZhbGlkYXRpb24sIG90aGVyd2lzZSBhbiBlcnJvciB0b1xuICogZGVzY3JpYmUgd2h5IHZhbGlkYXRpb24gZmFpbGVkLlxuICogQHByaXZhdGVcbiAqL1xuZnVuY3Rpb24gdmFsaWRhdGVDb25zdHJhaW50cyhtYXRjaGluZ0NvbnN0cmFpbnRzKSB7XG4gIGlmIChtYXRjaGluZ0NvbnN0cmFpbnRzLmNhbGxiYWNrSWQgJiZcbiAgICAgICEoaXNTdHJpbmcobWF0Y2hpbmdDb25zdHJhaW50cy5jYWxsYmFja0lkKSB8fCBpc1JlZ0V4cChtYXRjaGluZ0NvbnN0cmFpbnRzLmNhbGxiYWNrSWQpKSkge1xuICAgIHJldHVybiBuZXcgVHlwZUVycm9yKCdDYWxsYmFjayBJRCBtdXN0IGJlIGEgc3RyaW5nIG9yIFJlZ0V4cCcpO1xuICB9XG5cbiAgaWYgKG1hdGNoaW5nQ29uc3RyYWludHMuYmxvY2tJZCAmJlxuICAgICEoaXNTdHJpbmcobWF0Y2hpbmdDb25zdHJhaW50cy5ibG9ja0lkKSB8fCBpc1JlZ0V4cChtYXRjaGluZ0NvbnN0cmFpbnRzLmJsb2NrSWQpKSkge1xuICAgIHJldHVybiBuZXcgVHlwZUVycm9yKCdCbG9jayBJRCBtdXN0IGJlIGEgc3RyaW5nIG9yIFJlZ0V4cCcpO1xuICB9XG5cbiAgaWYgKG1hdGNoaW5nQ29uc3RyYWludHMuYWN0aW9uSWQgJiZcbiAgICAhKGlzU3RyaW5nKG1hdGNoaW5nQ29uc3RyYWludHMuYWN0aW9uSWQpIHx8IGlzUmVnRXhwKG1hdGNoaW5nQ29uc3RyYWludHMuYWN0aW9uSWQpKSkge1xuICAgIHJldHVybiBuZXcgVHlwZUVycm9yKCdBY3Rpb24gSUQgbXVzdCBiZSBhIHN0cmluZyBvciBSZWdFeHAnKTtcbiAgfVxuXG4gIHJldHVybiBmYWxzZTtcbn1cblxuLyoqXG4gKiBWYWxpZGF0ZXMgcHJvcGVydGllcyBvZiBhIG1hdGNoaW5nIGNvbnN0cmFpbnRzIG9iamVjdCBzcGVjaWZpYyB0byByZWdpc3RlcmluZyBhbiBvcHRpb25zIHJlcXVlc3RcbiAqIEBwYXJhbSB7T2JqZWN0fSBtYXRjaGluZ0NvbnN0cmFpbnRzIC0gb2JqZWN0IGRlc2NyaWJpbmcgdGhlIGNvbnN0cmFpbnRzIG9uIGEgY2FsbGJhY2tcbiAqIEByZXR1cm5zIHtFcnJvcnxmYWxzZX0gLSBhIGZhbHNlIHZhbHVlIHJlcHJlc2VudHMgc3VjY2Vzc2Z1bCB2YWxpZGF0aW9uLCBvdGhlcndpc2UgYW4gZXJyb3IgdG9cbiAqIGRlc2NyaWJlIHdoeSB2YWxpZGF0aW9uIGZhaWxlZC5cbiAqIEBwcml2YXRlXG4gKi9cbmZ1bmN0aW9uIHZhbGlkYXRlT3B0aW9uc0NvbnN0cmFpbnRzKG9wdGlvbnNDb25zdHJhaW50cykge1xuICBpZiAob3B0aW9uc0NvbnN0cmFpbnRzLndpdGhpbiAmJlxuICAgICEob3B0aW9uc0NvbnN0cmFpbnRzLndpdGhpbiA9PT0gJ2ludGVyYWN0aXZlX21lc3NhZ2UnIHx8XG4gICAgICBvcHRpb25zQ29uc3RyYWludHMud2l0aGluID09PSAnYmxvY2tfYWN0aW9ucycgfHxcbiAgICAgIG9wdGlvbnNDb25zdHJhaW50cy53aXRoaW4gPT09ICdkaWFsb2cnKVxuICApIHtcbiAgICByZXR1cm4gbmV3IFR5cGVFcnJvcignV2l0aGluIG11c3QgYmUgXFwnYmxvY2tfYWN0aW9uc1xcJywgXFwnaW50ZXJhY3RpdmVfbWVzc2FnZVxcJyBvciBcXCdkaWFsb2dcXCcnKTtcbiAgfVxuXG4gIC8vIFdlIGRvbid0IG5lZWQgdG8gdmFsaWRhdGUgdW5mdXJsLCB3ZSdsbCBqdXN0IGNvb2VyY2UgaXQgdG8gYSBib29sZWFuXG4gIHJldHVybiBmYWxzZTtcbn1cblxuLyoqXG4gKiBBbiBhZGFwdGVyIGZvciBTbGFjaydzIGludGVyYWN0aXZlIG1lc3NhZ2UgY29tcG9uZW50cyBzdWNoIGFzIGJ1dHRvbnMsIG1lbnVzLCBhbmQgZGlhbG9ncy5cbiAqIEB0eXBpY2FsbmFtZSBzbGFja0ludGVyYWN0aW9uc1xuICovXG5leHBvcnQgY2xhc3MgU2xhY2tNZXNzYWdlQWRhcHRlciB7XG4gIC8qKlxuICAgKiBDcmVhdGUgYSBtZXNzYWdlIGFkYXB0ZXIuXG4gICAqXG4gICAqIEBwYXJhbSB7c3RyaW5nfSBzaWduaW5nU2VjcmV0IC0gU2xhY2sgYXBwIHNpZ25pbmcgc2VjcmV0IHVzZWQgdG8gYXV0aGVudGljYXRlIHJlcXVlc3RcbiAgICogQHBhcmFtIHtPYmplY3R9IFtvcHRpb25zXVxuICAgKiBAcGFyYW0ge251bWJlcn0gW29wdGlvbnMuc3luY1Jlc3BvbnNlVGltZW91dD0yNTAwXSAtIG51bWJlciBvZiBtaWxsaXNlY29uZHMgdG8gd2FpdCBiZWZvcmVcbiAgICogZmx1c2hpbmcgYSBzeW5jcmhvbm91cyByZXNwb25zZSB0byBhbiBpbmNvbWluZyByZXF1ZXN0IGFuZCBmYWxsaW5nIGJhY2sgdG8gYW4gYXN5bmNocm9ub3VzXG4gICAqIHJlc3BvbnNlLlxuICAgKiBAcGFyYW0ge2Jvb2xlYW59IFtvcHRpb25zLmxhdGVSZXNwb25zZUZhbGxiYWNrRW5hYmxlZD10cnVlXSAtIHdoZXRoZXIgb3Igbm90IHByb21pc2VzIHRoYXRcbiAgICogcmVzb2x2ZSBhZnRlciB0aGUgc3luY1Jlc3BvbnNlVGltZW91dCBjYW4gZmFsbGJhY2sgdG8gYSByZXF1ZXN0IGZvciB0aGUgcmVzcG9uc2VfdXJsLiB0aGlzIG9ubHlcbiAgICogd29ya3MgaW4gY2FzZXMgd2hlcmUgdGhlIHNlbWFudGljIG1lYW5pbmcgb2YgdGhlIHJlc3BvbnNlIGFuZCB0aGUgcmVzcG9uc2VfdXJsIGFyZSB0aGUgc2FtZS5cbiAgICovXG4gIGNvbnN0cnVjdG9yKHNpZ25pbmdTZWNyZXQsIHtcbiAgICBzeW5jUmVzcG9uc2VUaW1lb3V0ID0gMjUwMCxcbiAgICBsYXRlUmVzcG9uc2VGYWxsYmFja0VuYWJsZWQgPSB0cnVlLFxuICB9ID0ge30pIHtcbiAgICBpZiAoIWlzU3RyaW5nKHNpZ25pbmdTZWNyZXQpKSB7XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdTbGFja01lc3NhZ2VBZGFwdGVyIG5lZWRzIGEgc2lnbmluZyBzZWNyZXQnKTtcbiAgICB9XG5cbiAgICBpZiAoc3luY1Jlc3BvbnNlVGltZW91dCA+IDMwMDAgfHwgc3luY1Jlc3BvbnNlVGltZW91dCA8IDEpIHtcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ3N5bmNSZXNwb25zZVRpbWVvdXQgbXVzdCBiZSBiZXR3ZWVuIDEgYW5kIDMwMDAnKTtcbiAgICB9XG5cbiAgICB0aGlzLnNpZ25pbmdTZWNyZXQgPSBzaWduaW5nU2VjcmV0O1xuICAgIHRoaXMuc3luY1Jlc3BvbnNlVGltZW91dCA9IHN5bmNSZXNwb25zZVRpbWVvdXQ7XG4gICAgdGhpcy5sYXRlUmVzcG9uc2VGYWxsYmFja0VuYWJsZWQgPSBsYXRlUmVzcG9uc2VGYWxsYmFja0VuYWJsZWQ7XG4gICAgdGhpcy5jYWxsYmFja3MgPSBbXTtcbiAgICB0aGlzLmF4aW9zID0gYXhpb3MuY3JlYXRlKHtcbiAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgJ1VzZXItQWdlbnQnOiBwYWNrYWdlSWRlbnRpZmllcigpLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIGRlYnVnKCdpbnN0YW50aWF0ZWQnKTtcbiAgfVxuXG4gIC8qIEludGVyZmFjZSBmb3IgdXNpbmcgdGhlIGJ1aWx0LWluIHNlcnZlciAqL1xuXG4gIC8qKlxuICAgKiBDcmVhdGUgYSBzZXJ2ZXIgdGhhdCBkaXNwYXRjaGVzIFNsYWNrJ3MgaW50ZXJhY3RpdmUgbWVzc2FnZSBhY3Rpb25zIGFuZCBtZW51IHJlcXVlc3RzIHRvIHRoaXNcbiAgICogbWVzc2FnZSBhZGFwdGVyIGluc3RhbmNlLiBVc2UgdGhpcyBtZXRob2QgaWYgeW91ciBhcHBsaWNhdGlvbiB3aWxsIGhhbmRsZSBzdGFydGluZyB0aGUgc2VydmVyLlxuICAgKlxuICAgKiBAcGFyYW0ge3N0cmluZ30gW3BhdGg9L3NsYWNrL2FjdGlvbnNdIC0gVGhlIHBhdGggcG9ydGlvbiBvZiB0aGUgVVJMIHdoZXJlIHRoZSBzZXJ2ZXIgd2lsbFxuICAgKiBsaXN0ZW4gZm9yIHJlcXVlc3RzIGZyb20gU2xhY2sncyBpbnRlcmFjdGl2ZSBtZXNzYWdlcy5cbiAgICogQHJldHVybnMge1Byb21pc2U8Tm9kZUh0dHBTZXJ2ZXI+fSAtIEEgcHJvbWlzZSB0aGF0IHJlc29sdmVzIHRvIGFuIGluc3RhbmNlIG9mIGh0dHAuU2VydmVyIGFuZFxuICAgKiB3aWxsIGRpc3BhdGNoIGludGVyYWN0aXZlIG1lc3NhZ2UgYWN0aW9ucyBhbmQgb3B0aW9ucyByZXF1ZXN0cyB0byB0aGlzIG1lc3NhZ2UgYWRhcHRlclxuICAgKiBpbnN0YW5jZS4gaHR0cHM6Ly9ub2RlanMub3JnL2Rpc3QvbGF0ZXN0L2RvY3MvYXBpL2h0dHAuaHRtbCNodHRwX2NsYXNzX2h0dHBfc2VydmVyXG4gICAqL1xuICBjcmVhdGVTZXJ2ZXIocGF0aCA9ICcvc2xhY2svYWN0aW9ucycpIHtcbiAgICAvLyBUT0RPOiBtb3JlIG9wdGlvbnMgKGxpa2UgaHR0cHMpXG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpLnRoZW4oKCkgPT4ge1xuICAgICAgZGVidWcoJ3NlcnZlciBjcmVhdGVkIC0gcGF0aDogJXMnLCBwYXRoKTtcblxuICAgICAgcmV0dXJuIGh0dHAuY3JlYXRlU2VydmVyKHRoaXMucmVxdWVzdExpc3RlbmVyKCkpO1xuICAgIH0pO1xuICB9XG5cbiAgLyoqXG4gICAqIFN0YXJ0IGEgYnVpbHQtaW4gc2VydmVyIHRoYXQgZGlzcGF0Y2hlcyBTbGFjaydzIGludGVyYWN0aXZlIG1lc3NhZ2UgYWN0aW9ucyBhbmQgbWVudSByZXF1ZXN0c1xuICAgKiB0byB0aGlzIG1lc3NhZ2UgYWRhcHRlciBpbnRlcmZhY2UuXG4gICAqXG4gICAqIEBwYXJhbSB7bnVtYmVyfSBwb3J0XG4gICAqIEByZXR1cm5zIHtQcm9taXNlPHZvaWQ+fSAtIEEgcHJvbWlzZSB0aGF0IHJlc29sdmVzIG9uY2UgdGhlIHNlcnZlciBpcyByZWFkeVxuICAgKi9cbiAgc3RhcnQocG9ydCkge1xuICAgIHJldHVybiB0aGlzLmNyZWF0ZVNlcnZlcigpXG4gICAgICAudGhlbihzZXJ2ZXIgPT4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgICAgICB0aGlzLnNlcnZlciA9IHNlcnZlcjtcbiAgICAgICAgc2VydmVyLm9uKCdlcnJvcicsIHJlamVjdCk7XG4gICAgICAgIHNlcnZlci5saXN0ZW4ocG9ydCwgKCkgPT4gcmVzb2x2ZShzZXJ2ZXIpKTtcbiAgICAgICAgZGVidWcoJ3NlcnZlciBzdGFydGVkIC0gcG9ydDogJXMnLCBwb3J0KTtcbiAgICAgIH0pKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBTdG9wIHRoZSBwcmV2aW91c2x5IHN0YXJ0ZWQgYnVpbHQtaW4gc2VydmVyLlxuICAgKlxuICAgKiBAcmV0dXJucyB7UHJvbWlzZTx2b2lkPn0gLSBBIHByb21pc2UgdGhhdCByZXNvbHZlcyBvbmNlIHRoZSBzZXJ2ZXIgaXMgY2xlYW5lZCB1cC5cbiAgICovXG4gIHN0b3AoKSB7XG4gICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICAgIGlmICh0aGlzLnNlcnZlcikge1xuICAgICAgICB0aGlzLnNlcnZlci5jbG9zZSgoZXJyb3IpID0+IHtcbiAgICAgICAgICBkZWxldGUgdGhpcy5zZXJ2ZXI7XG4gICAgICAgICAgaWYgKGVycm9yKSB7XG4gICAgICAgICAgICByZWplY3QoZXJyb3IpO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICByZXNvbHZlKCk7XG4gICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJlamVjdChuZXcgRXJyb3IoJ1NsYWNrTWVzc2FnZUFkYXB0ZXIgY2Fubm90IHN0b3Agd2hlbiBpdCBkaWQgbm90IHN0YXJ0IGEgc2VydmVyJykpO1xuICAgICAgfVxuICAgIH0pO1xuICB9XG5cbiAgLyogSW50ZXJmYWNlIGZvciBicmluZ2luZyB5b3VyIG93biBzZXJ2ZXIgKi9cblxuICAvKipcbiAgICogQ3JlYXRlIGEgbWlkZGxld2FyZSBmdW5jdGlvbiB0aGF0IGNhbiBiZSB1c2VkIHRvIGludGVncmF0ZSB3aXRoIHRoZSBgZXhwcmVzc2Agd2ViIGZyYW1ld29ya1xuICAgKiBpbiBvcmRlciBmb3IgaW5jb21pbmcgcmVxdWVzdHMgdG8gYmUgZGlzcGF0Y2hlZCB0byB0aGlzIG1lc3NhZ2UgYWRhcHRlciBpbnN0YW5jZS5cbiAgICpcbiAgICogQHJldHVybnMge0V4cHJlc3NNaWRkbGV3YXJlRnVuY30gLSBBIG1pZGRsZXdhcmUgZnVuY3Rpb24gaHR0cDovL2V4cHJlc3Nqcy5jb20vZW4vZ3VpZGUvdXNpbmctbWlkZGxld2FyZS5odG1sXG4gICAqL1xuICBleHByZXNzTWlkZGxld2FyZSgpIHtcbiAgICBjb25zdCByZXF1ZXN0TGlzdGVuZXIgPSB0aGlzLnJlcXVlc3RMaXN0ZW5lcigpO1xuICAgIHJldHVybiAocmVxLCByZXMpID0+IHtcbiAgICAgIHJlcXVlc3RMaXN0ZW5lcihyZXEsIHJlcyk7XG4gICAgfTtcbiAgfVxuXG4gIC8qKlxuICAgKiBDcmVhdGUgYSByZXF1ZXN0IGxpc3RlbmVyIGZ1bmN0aW9uIHRoYXQgaGFuZGxlcyBIVFRQIHJlcXVlc3RzLCB2ZXJpZmllcyByZXF1ZXN0c1xuICAgKiBhbmQgZGlzcGF0Y2hlcyByZXNwb25zZXNcbiAgICpcbiAgICogQHJldHVybnMge3NsYWNrUmVxdWVzdExpc3RlbmVyfVxuICAgKi9cbiAgcmVxdWVzdExpc3RlbmVyKCkge1xuICAgIHJldHVybiBjcmVhdGVIVFRQSGFuZGxlcih0aGlzKTtcbiAgfVxuXG4gIC8qIEludGVyZmFjZSBmb3IgYWRkaW5nIGhhbmRsZXJzICovXG5cbiAgLyogZXNsaW50LWRpc2FibGUgbWF4LWxlbiAqL1xuICAvKipcbiAgICogQWRkIGEgaGFuZGxlciBmb3IgYW4gaW50ZXJhY3RpdmUgbWVzc2FnZSBhY3Rpb24uXG4gICAqXG4gICAqIFVzdWFsbHkgdGhlcmUncyBubyBuZWVkIHRvIGJlIGNvbmNlcm5lZCB3aXRoIF9ob3dfIGEgbWVzc2FnZSBpcyBzZW50IHRvIFNsYWNrLCBidXQgdGhlXG4gICAqIGZvbGxvd2luZyB0YWJsZSBkZXNjcmliZXMgaXQgZnVsbHkuXG4gICAqXG4gICAqICoqQWN0aW9uKip8KipSZXR1cm4gYG9iamVjdGAqKnwqKlJldHVybiBgUHJvbWlzZTxvYmplY3Q+YCoqfCoqUmV0dXJuIGB1bmRlZmluZWRgKip8KipDYWxsIGByZXNwb25kKG1lc3NhZ2UpYCoqfCoqTm90ZXMqKlxuICAgKiA6LS0tLS06fDotLS0tLTp8Oi0tLS0tOnw6LS0tLS06fDotLS0tLTp8Oi0tLS0tOlxuICAgKiAqKkJ1dHRvbiBQcmVzcyoqfCBNZXNzYWdlIGluIHJlc3BvbnNlIHwgV2hlbiByZXNvbHZlZCBiZWZvcmUgYHN5bmNSZXNwb3NlVGltZW91dGAgb3IgYGxhdGVSZXNwb25zZUZhbGxiYWNrRW5hYmxlZDogZmFsc2VgLCBtZXNzYWdlIGluIHJlc3BvbnNlPGJyIC8+V2hlbiByZXNvbHZlZCBhZnRlciBgc3luY1Jlc3BvbnNlVGltZW91dGAgYW5kIGBsYXRlUmVzcG9uc2VGYWxsYmFja0VuYWJsZWQ6IHRydWVgLCBtZXNzYWdlIGluIHJlcXVlc3QgdG8gYHJlc3BvbnNlX3VybGAgfCBFbXB0eSByZXNwb25zZSB8IE1lc3NhZ2UgaW4gcmVxdWVzdCB0byBgcmVzcG9uc2VfdXJsYCB8IENyZWF0ZSBhIG5ldyBtZXNzYWdlIGluc3RlYWQgb2YgcmVwbGFjaW5nIHVzaW5nIGByZXBsYWNlX29yaWdpbmFsOiBmYWxzZWBcbiAgICogKipNZW51IFNlbGVjdGlvbioqfCBNZXNzYWdlIGluIHJlc3BvbnNlIHwgV2hlbiByZXNvbHZlZCBiZWZvcmUgYHN5bmNSZXNwb3NlVGltZW91dGAgb3IgYGxhdGVSZXNwb25zZUZhbGxiYWNrRW5hYmxlZDogZmFsc2VgLCBtZXNzYWdlIGluIHJlc3BvbnNlPGJyIC8+V2hlbiByZXNvbHZlZCBhZnRlciBgc3luY1Jlc3BvbnNlVGltZW91dGAgYW5kIGBsYXRlUmVzcG9uc2VGYWxsYmFja0VuYWJsZWQ6IHRydWVgLCBtZXNzYWdlIGluIHJlcXVlc3QgdG8gYHJlc3BvbnNlX3VybGAgfCBFbXB0eSByZXNwb25zZSB8IE1lc3NhZ2UgaW4gcmVxdWVzdCB0byBgcmVzcG9uc2VfdXJsYCB8IENyZWF0ZSBhIG5ldyBtZXNzYWdlIGluc3RlYWQgb2YgcmVwbGFjaW5nIHVzaW5nIGByZXBsYWNlX29yaWdpbmFsOiBmYWxzZWBcbiAgICogKipNZXNzYWdlIEFjdGlvbioqIHwgTWVzc2FnZSBpbiByZXNwb25zZSB8IFdoZW4gcmVzb2x2ZWQgYmVmb3JlIGBzeW5jUmVzcG9zZVRpbWVvdXRgIG9yIGBsYXRlUmVzcG9uc2VGYWxsYmFja0VuYWJsZWQ6IGZhbHNlYCwgbWVzc2FnZSBpbiByZXNwb25zZTxiciAvPldoZW4gcmVzb2x2ZWQgYWZ0ZXIgYHN5bmNSZXNwb25zZVRpbWVvdXRgIGFuZCBgbGF0ZVJlc3BvbnNlRmFsbGJhY2tFbmFibGVkOiB0cnVlYCwgbWVzc2FnZSBpbiByZXF1ZXN0IHRvIGByZXNwb25zZV91cmxgIHwgRW1wdHkgcmVzcG9uc2UgfCBNZXNzYWdlIGluIHJlcXVlc3QgdG8gYHJlc3BvbnNlX3VybGAgfFxuICAgKiAqKkRpYWxvZyBTdWJtaXNzaW9uKip8IEVycm9yIGxpc3QgaW4gcmVzcG9uc2UgfCBFcnJvciBsaXN0IGluIHJlc3BvbnNlIHwgRW1wdHkgcmVzcG9uc2UgfCBNZXNzYWdlIGluIHJlcXVlc3QgdG8gYHJlc3BvbnNlX3VybGAgfCBSZXR1cm5pbmcgYSBQcm9taXNlIHRoYXQgdGFrZXMgbG9uZ2VyIHRoYW4gMyBzZWNvbmRzIHRvIHJlc29sdmUgY2FuIHJlc3VsdCBpbiB0aGUgdXNlciBzZWVpbmcgYW4gZXJyb3IuIFdhcm5pbmcgbG9nZ2VkIGlmIGEgcHJvbWlzZSBpc24ndCBjb21wbGV0ZWQgYmVmb3JlIGBzeW5jUmVzcG9uc2VUaW1lb3V0YC5cbiAgICpcbiAgICogQHBhcmFtIHtPYmplY3R8c3RyaW5nfFJlZ0V4cH0gbWF0Y2hpbmdDb25zdHJhaW50cyAtIHRoZSBjYWxsYmFjayBJRCAoYXMgYSBzdHJpbmcgb3IgUmVnRXhwKSBvclxuICAgKiBhbiBvYmplY3QgZGVzY3JpYmluZyB0aGUgY29uc3RyYWludHMgdG8gbWF0Y2ggYWN0aW9ucyBmb3IgdGhlIGhhbmRsZXIuXG4gICAqIEBwYXJhbSB7c3RyaW5nfFJlZ0V4cH0gW21hdGNoaW5nQ29uc3RyYWludHMuY2FsbGJhY2tJZF0gLSBhIHN0cmluZyBvciBSZWdFeHAgdG8gbWF0Y2ggYWdhaW5zdFxuICAgKiB0aGUgYGNhbGxiYWNrX2lkYFxuICAgKiBAcGFyYW0ge3N0cmluZ3xSZWdFeHB9IFttYXRjaGluZ0NvbnN0cmFpbnRzLmJsb2NrSWRdIC0gYSBzdHJpbmcgb3IgUmVnRXhwIHRvIG1hdGNoIGFnYWluc3RcbiAgICogdGhlIGBibG9ja19pZGBcbiAgICogQHBhcmFtIHtzdHJpbmd8UmVnRXhwfSBbbWF0Y2hpbmdDb25zdHJhaW50cy5hY3Rpb25JZF0gLSBhIHN0cmluZyBvciBSZWdFeHAgdG8gbWF0Y2ggYWdhaW5zdFxuICAgKiB0aGUgYGFjdGlvbl9pZGBcbiAgICogQHBhcmFtIHtzdHJpbmd9IFttYXRjaGluZ0NvbnN0cmFpbnRzLnR5cGVdIC0gdmFsaWQgdHlwZXMgaW5jbHVkZSBhbGxcbiAgICogW2FjdGlvbnMgYmxvY2sgZWxlbWVudHNdKGh0dHBzOi8vYXBpLnNsYWNrLmNvbS9yZWZlcmVuY2UvbWVzc2FnaW5nL2ludGVyYWN0aXZlLWNvbXBvbmVudHMpLFxuICAgKiBgc2VsZWN0YCBvbmx5IGZvciBtZW51IHNlbGVjdGlvbnMsIG9yIGBkaWFsb2dfc3VibWlzc2lvbmAgb25seSBmb3IgZGlhbG9nIHN1Ym1pc3Npb25zXG4gICAqIEBwYXJhbSB7Ym9vbGVhbn0gW21hdGNoaW5nQ29uc3RyYWludHMudW5mdXJsXSAtIHdoZW4gYHRydWVgIG9ubHkgbWF0Y2ggYWN0aW9ucyBmcm9tIGFuIHVuZnVybFxuICAgKiBAcGFyYW0ge21vZHVsZTphZGFwdGVyflNsYWNrTWVzc2FnZUFkYXB0ZXJ+QWN0aW9uSGFuZGxlcn0gY2FsbGJhY2sgLSB0aGUgZnVuY3Rpb24gdG8gcnVuIHdoZW5cbiAgICogYW4gYWN0aW9uIGlzIG1hdGNoZWRcbiAgICogQHJldHVybnMge21vZHVsZTphZGFwdGVyflNsYWNrTWVzc2FnZUFkYXB0ZXJ9IC0gdGhpcyBpbnN0YW5jZSAoZm9yIGNoYWluaW5nKVxuICAgKi9cbiAgYWN0aW9uKG1hdGNoaW5nQ29uc3RyYWludHMsIGNhbGxiYWNrKSB7XG4gICAgLyogZXNsaW50LWVuYWJsZSBtYXgtbGVuICovXG4gICAgY29uc3QgYWN0aW9uQ29uc3RyYWludHMgPSBmb3JtYXRNYXRjaGluZ0NvbnN0cmFpbnRzKG1hdGNoaW5nQ29uc3RyYWludHMpO1xuICAgIGFjdGlvbkNvbnN0cmFpbnRzLmhhbmRsZXJUeXBlID0gJ2FjdGlvbic7XG5cbiAgICBjb25zdCBlcnJvciA9IHZhbGlkYXRlQ29uc3RyYWludHMoYWN0aW9uQ29uc3RyYWludHMpO1xuICAgIGlmIChlcnJvcikge1xuICAgICAgZGVidWcoJ2FjdGlvbiBjb3VsZCBub3QgYmUgcmVnaXN0ZXJlZDogJXMnLCBlcnJvci5tZXNzYWdlKTtcbiAgICAgIHRocm93IGVycm9yO1xuICAgIH1cblxuICAgIHJldHVybiB0aGlzLnJlZ2lzdGVyQ2FsbGJhY2soYWN0aW9uQ29uc3RyYWludHMsIGNhbGxiYWNrKTtcbiAgfVxuXG4gIC8qIGVzbGludC1kaXNhYmxlIG1heC1sZW4gKi9cbiAgLyoqXG4gICAqIEFkZCBhIGhhbmRsZXIgZm9yIGFuIG9wdGlvbnMgcmVxdWVzdFxuICAgKlxuICAgKiBVc3VhbGx5IHRoZXJlJ3Mgbm8gbmVlZCB0byBiZSBjb25jZXJuZWQgd2l0aCBfaG93XyBhIG1lc3NhZ2UgaXMgc2VudCB0byBTbGFjaywgYnV0IHRoZVxuICAgKiBmb2xsb3dpbmcgdGFibGUgZGVzY3JpYmVzIGl0IGZ1bGx5XG4gICAqXG4gICAqICZuYnNwO3wqKlJldHVybiBgb3B0aW9uc2AqKnwqKlJldHVybiBgUHJvbWlzZTxvcHRpb25zPmAqKnwqKlJldHVybiBgdW5kZWZpbmVkYCoqfCoqTm90ZXMqKlxuICAgKiA6LS0tLS06fDotLS0tLTp8Oi0tLS0tOnw6LS0tLS06fDotLS0tLTpcbiAgICogKipPcHRpb25zIFJlcXVlc3QqKnwgT3B0aW9ucyBpbiByZXNwb25zZSB8IE9wdGlvbnMgaW4gcmVzcG9uc2UgfCBFbXB0eSByZXNwb25zZSB8IFJldHVybmluZyBhIFByb21pc2UgdGhhdCB0YWtlcyBsb25nZXIgdGhhbiAzIHNlY29uZHMgdG8gcmVzb2x2ZSBjYW4gcmVzdWx0IGluIHRoZSB1c2VyIHNlZWluZyBhbiBlcnJvci4gSWYgdGhlIHJlcXVlc3QgaXMgZnJvbSB3aXRoaW4gYSBkaWFsb2csIHRoZSBgdGV4dGAgZmllbGQgaXMgY2FsbGVkIGBsYWJlbGAuXG4gICAqXG4gICAqIEBwYXJhbSB7b2JqZWN0fSBtYXRjaGluZ0NvbnN0cmFpbnRzIC0gdGhlIGNhbGxiYWNrIElEIChhcyBhIHN0cmluZyBvciBSZWdFeHApIG9yXG4gICAqIGFuIG9iamVjdCBkZXNjcmliaW5nIHRoZSBjb25zdHJhaW50cyB0byBzZWxlY3Qgb3B0aW9ucyByZXF1ZXN0cyBmb3IgdGhlIGhhbmRsZXIuXG4gICAqIEBwYXJhbSB7c3RyaW5nfFJlZ0V4cH0gW21hdGNoaW5nQ29uc3RyYWludHMuY2FsbGJhY2tJZF0gLSBhIHN0cmluZyBvciBSZWdFeHAgdG8gbWF0Y2ggYWdhaW5zdFxuICAgKiB0aGUgYGNhbGxiYWNrX2lkYFxuICAgKiBAcGFyYW0ge3N0cmluZ3xSZWdFeHB9IFttYXRjaGluZ0NvbnN0cmFpbnRzLmJsb2NrSWRdIC0gYSBzdHJpbmcgb3IgUmVnRXhwIHRvIG1hdGNoIGFnYWluc3RcbiAgICogdGhlIGBibG9ja19pZGBcbiAgICogQHBhcmFtIHtzdHJpbmd8UmVnRXhwfSBbbWF0Y2hpbmdDb25zdHJhaW50cy5hY3Rpb25JZF0gLSBhIHN0cmluZyBvciBSZWdFeHAgdG8gbWF0Y2ggYWdhaW5zdFxuICAgKiB0aGUgYGFjdGlvbl9pZGBcbiAgICogQHBhcmFtIHtzdHJpbmd9IFttYXRjaGluZ0NvbnN0cmFpbnRzLndpdGhpbl0gLSBgYmxvY2tfYWN0aW9uc2Agb25seSBmb3IgZXh0ZXJuYWwgc2VsZWN0XG4gICAqIGluIGFjdGlvbnMgYmxvY2ssIGBpbnRlcmFjdGl2ZV9tZXNzYWdlYCBvbmx5IGZvciBtZW51cyBpbiBhbiBpbnRlcmFjdGl2ZSBtZXNzYWdlLCBvclxuICAgKiBgZGlhbG9nYCBvbmx5IGZvciBtZW51cyBpbiBhIGRpYWxvZ1xuICAgKiBAcGFyYW0ge21vZHVsZTphZGFwdGVyflNsYWNrTWVzc2FnZUFkYXB0ZXJ+T3B0aW9uc0hhbmRsZXJ9IGNhbGxiYWNrIC0gdGhlIGZ1bmN0aW9uIHRvIHJ1biB3aGVuXG4gICAqIGFuIG9wdGlvbnMgcmVxdWVzdCBpcyBtYXRjaGVkXG4gICAqIEByZXR1cm5zIHttb2R1bGU6YWRhcHRlcn5TbGFja01lc3NhZ2VBZGFwdGVyfSAtIHRoaXMgaW5zdGFuY2UgKGZvciBjaGFpbmluZylcbiAgICovXG4gIG9wdGlvbnMobWF0Y2hpbmdDb25zdHJhaW50cywgY2FsbGJhY2spIHtcbiAgICAvKiBlc2xpbnQtZW5hYmxlIG1heC1sZW4gKi9cbiAgICBjb25zdCBvcHRpb25zQ29uc3RyYWludHMgPSBmb3JtYXRNYXRjaGluZ0NvbnN0cmFpbnRzKG1hdGNoaW5nQ29uc3RyYWludHMpO1xuICAgIG9wdGlvbnNDb25zdHJhaW50cy5oYW5kbGVyVHlwZSA9ICdvcHRpb25zJztcblxuICAgIGNvbnN0IGVycm9yID0gdmFsaWRhdGVDb25zdHJhaW50cyhvcHRpb25zQ29uc3RyYWludHMpIHx8XG4gICAgICB2YWxpZGF0ZU9wdGlvbnNDb25zdHJhaW50cyhvcHRpb25zQ29uc3RyYWludHMpO1xuICAgIGlmIChlcnJvcikge1xuICAgICAgZGVidWcoJ29wdGlvbnMgY291bGQgbm90IGJlIHJlZ2lzdGVyZWQ6ICVzJywgZXJyb3IubWVzc2FnZSk7XG4gICAgICB0aHJvdyBlcnJvcjtcbiAgICB9XG5cbiAgICByZXR1cm4gdGhpcy5yZWdpc3RlckNhbGxiYWNrKG9wdGlvbnNDb25zdHJhaW50cywgY2FsbGJhY2spO1xuICB9XG5cbiAgLyogSW50ZXJmYWNlIGZvciBIVFRQIHNlcnZlcnMgKGxpa2UgZXhwcmVzcyBtaWRkbGV3YXJlKSAqL1xuXG4gIC8qKlxuICAgKiBEaXNwYXRjaGVzIHRoZSBjb250ZW50cyBvZiBhbiBIVFRQIHJlcXVlc3QgdG8gdGhlIHJlZ2lzdGVyZWQgaGFuZGxlcnMuXG4gICAqXG4gICAqIEBwYXJhbSB7b2JqZWN0fSBwYXlsb2FkXG4gICAqIEByZXR1cm5zIHtQcm9taXNlPHsgc3RhdHVzOiBudW1iZXIsIGNvbnRlbnQ6IG9iamVjdHxzdHJpbmd8dW5kZWZpbmVkIH0+fHVuZGVmaW5lZH0gLSBBIHByb21pc2VcbiAgICogb2YgdGhlIHJlc3BvbnNlIGluZm9ybWF0aW9uIChhbiBvYmplY3Qgd2l0aCBzdGF0dXMgYW5kIGNvbnRlbnQgdGhhdCBpcyBhIEpTT04gc2VyaWFsaXphYmxlXG4gICAqIG9iamVjdCBvciBhIHN0cmluZyBvciB1bmRlZmluZWQpIGZvciB0aGUgcmVxdWVzdC4gQW4gdW5kZWZpbmVkIHJldHVybiB2YWx1ZSBpbmRpY2F0ZXMgdGhhdCB0aGVcbiAgICogcmVxdWVzdCB3YXMgbm90IG1hdGNoZWQuXG4gICAqIEBwcml2YXRlXG4gICAqL1xuICBkaXNwYXRjaChwYXlsb2FkKSB7XG4gICAgY29uc3QgY2FsbGJhY2sgPSB0aGlzLm1hdGNoQ2FsbGJhY2socGF5bG9hZCk7XG4gICAgaWYgKCFjYWxsYmFjaykge1xuICAgICAgZGVidWcoJ2Rpc3BhdGNoIGNvdWxkIG5vdCBmaW5kIGEgaGFuZGxlcicpO1xuICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICB9XG4gICAgZGVidWcoJ2Rpc3BhdGNoaW5nIHRvIGhhbmRsZXInKTtcbiAgICBjb25zdCBbLCBjYWxsYmFja0ZuXSA9IGNhbGxiYWNrO1xuXG4gICAgLy8gd2hlbiBhIHJlc3BvbnNlX3VybCBpcyBwcmVzZW50LGByZXNwb25kKClgIGZ1bmN0aW9uIGNyZWF0ZWQgdG8gdG8gc2VuZCBhIG1lc3NhZ2UgdXNpbmcgaXRcbiAgICBsZXQgcmVzcG9uZDtcbiAgICBpZiAocGF5bG9hZC5yZXNwb25zZV91cmwpIHtcbiAgICAgIHJlc3BvbmQgPSAobWVzc2FnZSkgPT4ge1xuICAgICAgICBpZiAodHlwZW9mIG1lc3NhZ2UudGhlbiA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ0Nhbm5vdCB1c2UgYSBQcm9taXNlIGFzIHRoZSBwYXJhbWV0ZXIgZm9yIHJlc3BvbmQoKScpO1xuICAgICAgICB9XG4gICAgICAgIGRlYnVnKCdzZW5kaW5nIGFzeW5jIHJlc3BvbnNlJyk7XG4gICAgICAgIHJldHVybiB0aGlzLmF4aW9zLnBvc3QocGF5bG9hZC5yZXNwb25zZV91cmwsIG1lc3NhZ2UpO1xuICAgICAgfTtcbiAgICB9XG5cbiAgICBsZXQgY2FsbGJhY2tSZXN1bHQ7XG4gICAgdHJ5IHtcbiAgICAgIGNhbGxiYWNrUmVzdWx0ID0gY2FsbGJhY2tGbi5jYWxsKHRoaXMsIHBheWxvYWQsIHJlc3BvbmQpO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBkZWJ1ZygnY2FsbGJhY2sgZXJyb3I6ICVvJywgZXJyb3IpO1xuICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh7IHN0YXR1czogNTAwIH0pO1xuICAgIH1cblxuICAgIGlmIChjYWxsYmFja1Jlc3VsdCkge1xuICAgICAgcmV0dXJuIHByb21pc2VUaW1lb3V0KHRoaXMuc3luY1Jlc3BvbnNlVGltZW91dCwgY2FsbGJhY2tSZXN1bHQpXG4gICAgICAgIC50aGVuKGNvbnRlbnQgPT4gKHsgc3RhdHVzOiAyMDAsIGNvbnRlbnQgfSkpXG4gICAgICAgIC5jYXRjaCgoZXJyb3IpID0+IHtcbiAgICAgICAgICBpZiAoZXJyb3IuY29kZSA9PT0gdXRpbEVycm9yQ29kZXMuUFJPTUlTRV9USU1FT1VUKSB7XG4gICAgICAgICAgICAvLyB3YXJuIGFuZCBjb250aW51ZSBmb3IgcHJvbWlzZXMgdGhhdCBjYW5ub3QgYmUgc2F2ZWQgd2l0aCBhIGxhdGVyIGFzeW5jIHJlc3BvbnNlLlxuICAgICAgICAgICAgLy8gdGhpcyBpbmNsdWRlcyBkaWFsb2cgc3VibWlzc2lvbnMgYmVjYXVzZSB0aGUgcmVzcG9uc2VfdXJsIGRvZXNuJ3QgaGF2ZSB0aGUgc2FtZVxuICAgICAgICAgICAgLy8gc2VtYW50aWNzIGFzIHRoZSByZXNwb25zZSwgYW55IHJlcXVlc3QgdGhhdCBkb2Vzbid0IGNvbnRhaW4gYSByZXNwb25zZV91cmwsIGFuZFxuICAgICAgICAgICAgLy8gaWYgdGhpcyBoYXMgYmVlbiBleHBsaWNpdGx5IGRpc2FibGVkIGluIHRoZSBjb25maWd1cmF0aW9uLlxuICAgICAgICAgICAgaWYgKCF0aGlzLmxhdGVSZXNwb25zZUZhbGxiYWNrRW5hYmxlZCB8fCAhcmVzcG9uZCB8fCBwYXlsb2FkLnR5cGUgPT09ICdkaWFsb2dfc3VibWlzc2lvbicpIHtcbiAgICAgICAgICAgICAgZGVidWcoJ1dBUk5JTkc6IFRoZSByZXNwb25zZSBQcm9taXNlIGRpZCBub3QgcmVzb2x2ZSB1bmRlciB0aGUgdGltZW91dC4nKTtcbiAgICAgICAgICAgICAgcmV0dXJuIGNhbGxiYWNrUmVzdWx0XG4gICAgICAgICAgICAgICAgLnRoZW4oY29udGVudCA9PiAoeyBzdGF0dXM6IDIwMCwgY29udGVudCB9KSlcbiAgICAgICAgICAgICAgICAuY2F0Y2goKCkgPT4gKHsgc3RhdHVzOiA1MDAgfSkpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBzYXZlIGEgbGF0ZSBwcm9taXNlIGJ5IHNlbmRpbmcgYW4gZW1wdHkgYm9keSBpbiB0aGUgcmVzcG9uc2UsIGFuZCB0aGVuIHVzZSB0aGVcbiAgICAgICAgICAgIC8vIHJlc3BvbnNlX3VybCB0byBzZW5kIHRoZSBldmVudHVhbGx5IHJlc29sdmVkIHZhbHVlXG4gICAgICAgICAgICBjYWxsYmFja1Jlc3VsdC50aGVuKHJlc3BvbmQpLmNhdGNoKChjYWxsYmFja0Vycm9yKSA9PiB7XG4gICAgICAgICAgICAgIC8vIHdoZW4gdGhlIHByb21pc2UgaXMgbGF0ZSBhbmQgZmFpbHMsIHdlIGNhbm5vdCBkbyBhbnl0aGluZyBidXQgbG9nIGl0XG4gICAgICAgICAgICAgIGRlYnVnKCdFUlJPUjogUHJvbWlzZSB3YXMgbGF0ZSBhbmQgZmFpbGVkLiBVc2UgYC5jYXRjaCgpYCB0byBoYW5kbGUgZXJyb3JzLicpO1xuICAgICAgICAgICAgICB0aHJvdyBjYWxsYmFja0Vycm9yO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICByZXR1cm4geyBzdGF0dXM6IDIwMCB9O1xuICAgICAgICAgIH1cblxuICAgICAgICAgIHJldHVybiB7IHN0YXR1czogNTAwIH07XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIC8vIFRoZSBmb2xsb3dpbmcgcmVzdWx0IHZhbHVlIHJlcHJlc2VudHM6XG4gICAgLy8gKiBcIm5vIHJlcGxhY2VtZW50XCIgZm9yIG1lc3NhZ2UgYWN0aW9uc1xuICAgIC8vICogXCJzdWJtaXNzaW9uIGlzIHZhbGlkXCIgZm9yIGRpYWxvZyBzdWJtaXNzaW9uc1xuICAgIC8vICogXCJubyBzdWdnZXN0aW9uc1wiIGZvciBtZW51IG9wdGlvbnMgVE9ETzogY2hlY2sgdGhhdCB0aGlzIGlzIHRydWVcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHsgc3RhdHVzOiAyMDAgfSk7XG4gIH1cblxuICAvKipcbiAgICogQHByaXZhdGVcbiAgICovXG4gIHJlZ2lzdGVyQ2FsbGJhY2soY29uc3RyYWludHMsIGNhbGxiYWNrKSB7XG4gICAgLy8gVmFsaWRhdGlvblxuICAgIGlmICghaXNGdW5jdGlvbihjYWxsYmFjaykpIHtcbiAgICAgIGRlYnVnKCdkaWQgbm90IHJlZ2lzdGVyIGNhbGxiYWNrIGJlY2F1c2UgaXRzIG5vdCBhIGZ1bmN0aW9uJyk7XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdjYWxsYmFjayBtdXN0IGJlIGEgZnVuY3Rpb24nKTtcbiAgICB9XG5cbiAgICB0aGlzLmNhbGxiYWNrcy5wdXNoKFtjb25zdHJhaW50cywgY2FsbGJhY2tdKTtcblxuICAgIHJldHVybiB0aGlzO1xuICB9XG5cbiAgLyoqXG4gICAqIEBwcml2YXRlXG4gICAqL1xuICBtYXRjaENhbGxiYWNrKHBheWxvYWQpIHtcbiAgICByZXR1cm4gdGhpcy5jYWxsYmFja3MuZmluZCgoW2NvbnN0cmFpbnRzXSkgPT4ge1xuICAgICAgLy8gaWYgdGhlIGNhbGxiYWNrIElEIGNvbnN0cmFpbnQgaXMgc3BlY2lmaWVkLCBvbmx5IGNvbnRpbnVlIGlmIGl0IG1hdGNoZXNcbiAgICAgIGlmIChjb25zdHJhaW50cy5jYWxsYmFja0lkKSB7XG4gICAgICAgIGlmIChpc1N0cmluZyhjb25zdHJhaW50cy5jYWxsYmFja0lkKSAmJiBwYXlsb2FkLmNhbGxiYWNrX2lkICE9PSBjb25zdHJhaW50cy5jYWxsYmFja0lkKSB7XG4gICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9XG4gICAgICAgIGlmIChpc1JlZ0V4cChjb25zdHJhaW50cy5jYWxsYmFja0lkKSAmJiAhY29uc3RyYWludHMuY2FsbGJhY2tJZC50ZXN0KHBheWxvYWQuY2FsbGJhY2tfaWQpKSB7XG4gICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIC8vIGlmIHRoZSBhY3Rpb24gY29uc3RyYWludCBpcyBzcGVjaWZpZWQsIG9ubHkgY29udGludWUgaWYgaXQgbWF0Y2hlc1xuICAgICAgaWYgKGNvbnN0cmFpbnRzLmhhbmRsZXJUeXBlID09PSAnYWN0aW9uJykge1xuICAgICAgICAvLyBhIHBheWxvYWQgdGhhdCByZXByZXNlbnRzIGFuIGFjdGlvbiBlaXRoZXIgaGFzIGFjdGlvbnMsIHN1Ym1pc3Npb24sIG9yIG1lc3NhZ2UgZGVmaW5lZFxuICAgICAgICBpZiAoIShwYXlsb2FkLmFjdGlvbnMgfHwgcGF5bG9hZC5zdWJtaXNzaW9uIHx8IHBheWxvYWQubWVzc2FnZSkpIHtcbiAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBkaWFsb2cgc3VibWlzc2lvbnMgZG9uJ3QgaGF2ZSBhbiBhY3Rpb24gZGVmaW5lZCwgc28gYW4gZW1wdHkgYWN0aW9uIGlzIHN1YnN0aXR1dGVkIGZvclxuICAgICAgICAvLyB0aGUgcHVycG9zZSBvZiBjYWxsYmFjayBtYXRjaGluZ1xuICAgICAgICBjb25zdCBhY3Rpb24gPSBwYXlsb2FkLmFjdGlvbnMgPyBwYXlsb2FkLmFjdGlvbnNbMF0gOiB7fTtcblxuICAgICAgICAvLyBpZiB0aGUgYmxvY2sgSUQgY29uc3RyYWludCBpcyBzcGVjaWZpZWQsIG9ubHkgY29udGludWUgaWYgaXQgbWF0Y2hlc1xuICAgICAgICBpZiAoY29uc3RyYWludHMuYmxvY2tJZCkge1xuICAgICAgICAgIGlmIChpc1N0cmluZyhjb25zdHJhaW50cy5ibG9ja0lkKSAmJiBhY3Rpb24uYmxvY2tfaWQgIT09IGNvbnN0cmFpbnRzLmJsb2NrSWQpIHtcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKGlzUmVnRXhwKGNvbnN0cmFpbnRzLmJsb2NrSWQpICYmICFjb25zdHJhaW50cy5ibG9ja0lkLnRlc3QoYWN0aW9uLmJsb2NrX2lkKSkge1xuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIC8vIGlmIHRoZSBhY3Rpb24gSUQgY29uc3RyYWludCBpcyBzcGVjaWZpZWQsIG9ubHkgY29udGludWUgaWYgaXQgbWF0Y2hlc1xuICAgICAgICBpZiAoY29uc3RyYWludHMuYWN0aW9uSWQpIHtcbiAgICAgICAgICBpZiAoaXNTdHJpbmcoY29uc3RyYWludHMuYWN0aW9uSWQpICYmIGFjdGlvbi5hY3Rpb25faWQgIT09IGNvbnN0cmFpbnRzLmFjdGlvbklkKSB7XG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmIChpc1JlZ0V4cChjb25zdHJhaW50cy5hY3Rpb25JZCkgJiYgIWNvbnN0cmFpbnRzLmFjdGlvbklkLnRlc3QoYWN0aW9uLmFjdGlvbl9pZCkpIHtcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICAvLyBidXR0b24gYW5kIG1lc3NhZ2UgYWN0aW9ucyBoYXZlIGEgdHlwZSBkZWZpbmVkIGluc2lkZSB0aGUgYWN0aW9uLCBkaWFsb2cgc3VibWlzc2lvblxuICAgICAgICAvLyBhY3Rpb25zIGhhdmUgYSB0eXBlIGRlZmluZWQgYXQgdGhlIHRvcCBsZXZlbCwgYW5kIHNlbGVjdCBhY3Rpb25zIGRvbid0IGhhdmUgYSB0eXBlXG4gICAgICAgIC8vIGRlZmluZWQsIGJ1dCB0eXBlIGNhbiBiZSBpbmZlcnJlZCBieSBjaGVja2luZyBpZiBhIGBzZWxlY3RlZF9vcHRpb25zYCBwcm9wZXJ0eSBleGlzdHMgaW5cbiAgICAgICAgLy8gdGhlIGFjdGlvbi5cbiAgICAgICAgY29uc3QgdHlwZSA9IGFjdGlvbi50eXBlIHx8IHBheWxvYWQudHlwZSB8fCAoYWN0aW9uLnNlbGVjdGVkX29wdGlvbnMgJiYgJ3NlbGVjdCcpO1xuICAgICAgICBpZiAoIXR5cGUpIHtcbiAgICAgICAgICBkZWJ1Zygnbm8gdHlwZSBmb3VuZCBpbiBkaXNwYXRjaGVkIGFjdGlvbicpO1xuICAgICAgICB9XG4gICAgICAgIC8vIGlmIHRoZSB0eXBlIGNvbnN0cmFpbnQgaXMgc3BlY2lmaWVkLCBvbmx5IGNvbnRpbnVlIGlmIGl0IG1hdGNoZXNcbiAgICAgICAgaWYgKGNvbnN0cmFpbnRzLnR5cGUgJiYgY29uc3RyYWludHMudHlwZSAhPT0gdHlwZSkge1xuICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIGlmIHRoZSB1bmZ1cmwgY29uc3RyYWludCBpcyBzcGVjaWZpZWQsIG9ubHkgY29udGludWUgaWYgaXQgbWF0Y2hlc1xuICAgICAgICBpZiAoJ3VuZnVybCcgaW4gY29uc3RyYWludHMgJiZcbiAgICAgICAgICAoXG4gICAgICAgICAgICAoY29uc3RyYWludHMudW5mdXJsICYmICFwYXlsb2FkLmlzX2FwcF91bmZ1cmwpIHx8XG4gICAgICAgICAgICAoIWNvbnN0cmFpbnRzLnVuZnVybCAmJiBwYXlsb2FkLmlzX2FwcF91bmZ1cmwpXG4gICAgICAgICAgKVxuICAgICAgICApIHtcbiAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgaWYgKGNvbnN0cmFpbnRzLmhhbmRsZXJUeXBlID09PSAnb3B0aW9ucycpIHtcbiAgICAgICAgLy8gYSBwYXlsb2FkIHRoYXQgcmVwcmVzZW50cyBhbiBvcHRpb25zIHJlcXVlc3QgaW4gYXR0YWNobWVudHMgYWx3YXlzIGhhcyBhIG5hbWUgZGVmaW5lZFxuICAgICAgICAvLyBhdCB0aGUgdG9wIGxldmVsLiBpbiBibG9ja3MgdGhlIHR5cGUgaXMgYmxvY2tfc3VnZ2VzdGlvbiBhbmQgaGFzIG5vIG5hbWVcbiAgICAgICAgaWYgKCEoJ25hbWUnIGluIHBheWxvYWQgfHwgKHBheWxvYWQudHlwZSAmJiBwYXlsb2FkLnR5cGUgPT09ICdibG9ja19zdWdnZXN0aW9uJykpKSB7XG4gICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gaWYgdGhlIGJsb2NrIElEIGNvbnN0cmFpbnQgaXMgc3BlY2lmaWVkLCBvbmx5IGNvbnRpbnVlIGlmIGl0IG1hdGNoZXNcbiAgICAgICAgaWYgKGNvbnN0cmFpbnRzLmJsb2NrSWQpIHtcbiAgICAgICAgICBpZiAoaXNTdHJpbmcoY29uc3RyYWludHMuYmxvY2tJZCkgJiYgcGF5bG9hZC5ibG9ja19pZCAhPT0gY29uc3RyYWludHMuYmxvY2tJZCkge1xuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoaXNSZWdFeHAoY29uc3RyYWludHMuYmxvY2tJZCkgJiYgIWNvbnN0cmFpbnRzLmJsb2NrSWQudGVzdChwYXlsb2FkLmJsb2NrX2lkKSkge1xuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIC8vIGlmIHRoZSBhY3Rpb24gSUQgY29uc3RyYWludCBpcyBzcGVjaWZpZWQsIG9ubHkgY29udGludWUgaWYgaXQgbWF0Y2hlc1xuICAgICAgICBpZiAoY29uc3RyYWludHMuYWN0aW9uSWQpIHtcbiAgICAgICAgICBpZiAoaXNTdHJpbmcoY29uc3RyYWludHMuYWN0aW9uSWQpICYmIHBheWxvYWQuYWN0aW9uX2lkICE9PSBjb25zdHJhaW50cy5hY3Rpb25JZCkge1xuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoaXNSZWdFeHAoY29uc3RyYWludHMuYWN0aW9uSWQpICYmICFjb25zdHJhaW50cy5hY3Rpb25JZC50ZXN0KHBheWxvYWQuYWN0aW9uX2lkKSkge1xuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIC8vIGFuIG9wdGlvbnMgcmVxdWVzdCBhbHdheXMgaGFzIGEgdHlwZSBhdCB0aGUgdG9wIGxldmVsIHdoaWNoIGNhbiBiZSBvbmUgb2YgdGhyZWUgdmFsdWVzXG4gICAgICAgIC8vIHRoYXQgbmVlZCB0byBiZSBtYXBwZWQgaW50byB0aGUgdmFsdWVzIGZvciB0aGUgYHdpdGhpbmAgY29uc3RyYWludDpcbiAgICAgICAgLy8gKiB0eXBlOmludGVyYWN0aXZlX21lc3NhZ2UgPT4gd2l0aGluOmludGVyYWN0aXZlX21lc3NhZ2VcbiAgICAgICAgLy8gKiB0eXBlOmJsb2NrX3N1Z2dlc3Rpb24gPT4gd2l0aGluOmJsb2NrX2FjdGlvbnNcbiAgICAgICAgLy8gKiB0eXBlOmRpYWxvZ19zdWdnZXN0aW9uID0+IHdpdGhpbjpkaWFsb2dcbiAgICAgICAgaWYgKGNvbnN0cmFpbnRzLndpdGhpbikge1xuICAgICAgICAgIGlmIChjb25zdHJhaW50cy53aXRoaW4gPT09ICdpbnRlcmFjdGl2ZV9tZXNzYWdlJyAmJiBwYXlsb2FkLnR5cGUgIT09ICdpbnRlcmFjdGl2ZV9tZXNzYWdlJykge1xuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoY29uc3RyYWludHMud2l0aGluID09PSAnYmxvY2tfYWN0aW9ucycgJiYgcGF5bG9hZC50eXBlICE9PSAnYmxvY2tfc3VnZ2VzdGlvbicpIHtcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKGNvbnN0cmFpbnRzLndpdGhpbiA9PT0gJ2RpYWxvZycgJiYgcGF5bG9hZC50eXBlICE9PSAnZGlhbG9nX3N1Z2dlc3Rpb24nKSB7XG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIC8vIGlmIHRoZXJlJ3Mgbm8gcmVhc29uIHRvIGVsaW1pbmF0ZSB0aGlzIGNhbGxiYWNrLCB0aGVuIGl0cyBhIG1hdGNoIVxuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfSk7XG4gIH1cbn1cblxuLyoqXG4gKiBAYWxpYXMgbW9kdWxlOmFkYXB0ZXJcbiAqL1xuZXhwb3J0IGRlZmF1bHQgU2xhY2tNZXNzYWdlQWRhcHRlcjtcblxuLyoqXG4gKiBAZXh0ZXJuYWwgRXhwcmVzc01pZGRsZXdhcmVGdW5jXG4gKiBAc2VlIGh0dHA6Ly9leHByZXNzanMuY29tL2VuL2d1aWRlL3VzaW5nLW1pZGRsZXdhcmUuaHRtbFxuICovXG5cbi8qKlxuICogQGV4dGVybmFsIE5vZGVIdHRwU2VydmVyXG4gKiBAc2VlIGh0dHBzOi8vbm9kZWpzLm9yZy9kaXN0L2xhdGVzdC9kb2NzL2FwaS9odHRwLmh0bWwjaHR0cF9jbGFzc19odHRwX3NlcnZlclxuICovXG5cbi8qKlxuICogQSBoYW5kbGVyIGZ1bmN0aW9uIGZvciBhY3Rpb24gcmVxdWVzdHMgKGJsb2NrIGFjdGlvbnMsIGJ1dHRvbiBwcmVzc2VzLCBtZW51IHNlbGVjdGlvbnMsXG4gKiBhbmQgZGlhbG9nIHN1Ym1pc3Npb25zKS5cbiAqXG4gKiBAbmFtZSBtb2R1bGU6YWRhcHRlcn5TbGFja01lc3NhZ2VBZGFwdGVyfkFjdGlvbkhhbmRsZXJcbiAqIEBmdW5jdGlvblxuICogQHBhcmFtIHtPYmplY3R9IHBheWxvYWQgLSBhbiBvYmplY3QgZGVzY3JpYmluZyB0aGVcbiAqIFtibG9jayBhY3Rpb25zXShodHRwczovL2FwaS5zbGFjay5jb20vbWVzc2FnaW5nL2ludGVyYWN0aXZpdHkvZW5hYmxpbmcjdW5kZXJzdGFuZGluZy1wYXlsb2FkcylcbiAqIFtidXR0b24gcHJlc3NdKGh0dHBzOi8vYXBpLnNsYWNrLmNvbS9kb2NzL21lc3NhZ2UtYnV0dG9ucyNyZXNwb25kaW5nX3RvX21lc3NhZ2VfYWN0aW9ucyksXG4gKiBbbWVudSBzZWxlY3Rpb25dKGh0dHBzOi8vYXBpLnNsYWNrLmNvbS9kb2NzL21lc3NhZ2UtbWVudXMjcmVxdWVzdF91cmxfcmVzcG9uc2UpLCBvclxuICogW2RpYWxvZyBzdWJtaXNzaW9uXShodHRwczovL2FwaS5zbGFjay5jb20vZGlhbG9ncyNldmFsdWF0aW5nX3N1Ym1pc3Npb25fcmVzcG9uc2VzKS5cbiAqIEBwYXJhbSB7bW9kdWxlOmFkYXB0ZXJ+U2xhY2tNZXNzYWdlQWRhcHRlcn5BY3Rpb25IYW5kbGVyflJlc3BvbmR9IHJlc3BvbmQgLSBXaGVuIHRoZSBhY3Rpb24gaXMgYVxuICogYnV0dG9uIHByZXNzIG9yIG1lbnUgc2VsZWN0aW9uLCB0aGlzIGZ1bmN0aW9uIGlzIHVzZWQgdG8gdXBkYXRlIHRoZSBtZXNzYWdlIHdoZXJlIHRoZSBhY3Rpb25cbiAqIG9jY3VyZWQgb3IgY3JlYXRlIG5ldyBtZXNzYWdlcyBpbiB0aGUgc2FtZSBjb252ZXJzYXRpb24uIFdoZW4gdGhlIGFjdGlvbiBpcyBhIGRpYWxvZyBzdWJtaXNzaW9uLFxuICogdGhpcyBmdW5jdGlvbiBpcyB1c2VkIHRvIGNyZWF0ZSBuZXcgbWVzc2FnZXMgaW4gdGhlIGNvbnZlcnNhdGlvbiB3aGVyZSB0aGUgZGlhbG9nIHdhcyB0cmlnZ2VyZWQuXG4gKiBAcmV0dXJucyB7T2JqZWN0fSBXaGVuIHRoZSBhY3Rpb24gaXMgYSBidXR0b24gcHJlc3Mgb3IgYSBtZW51IHNlbGVjdGlvbiwgdGhpcyBvYmplY3QgaXMgYVxuICogcmVwbGFjZW1lbnRcbiAqIFttZXNzYWdlXShodHRwczovL2FwaS5zbGFjay5jb20vZG9jcy9pbnRlcmFjdGl2ZS1tZXNzYWdlLWZpZWxkLWd1aWRlI3RvcC1sZXZlbF9tZXNzYWdlX2ZpZWxkcylcbiAqIGZvciB0aGUgbWVzc2FnZSBpbiB3aGljaCB0aGUgYWN0aW9uIG9jY3VycmVkLiBJdCBtYXkgYWxzbyBiZSBhIFByb21pc2UgZm9yIGEgbWVzc2FnZSwgYW5kIGlmIHNvXG4gKiBhbmQgdGhlIFByb21pc2UgdGFrZXMgbG9uZ2VyIHRoYW4gdGhlIGBzeW5jUmVzcG9uc2VUaW1lb3V0YCB0byBjb21wbGV0ZSwgdGhlIG1lc3NhZ2UgaXMgc2VudCBvdmVyXG4gKiB0aGUgYHJlc3BvbnNlX3VybGAuIFRoZSBtZXNzYWdlIG1heSBhbHNvIGJlIGEgbmV3IG1lc3NhZ2UgaW4gdGhlIHNhbWUgY29udmVyc2F0aW9uIGJ5IHNldHRpbmdcbiAqIGByZXBsYWNlX29yaWdpbmFsOiBmYWxzZWAuIFdoZW4gdGhlIGFjdGlvbiBpcyBhIGRpYWxvZyBzdWJtaXNzaW9uLCB0aGlzIG9iamVjdCBpcyBhIGxpc3Qgb2ZcbiAqIFt2YWxpZGF0aW9uIGVycm9yc10oaHR0cHM6Ly9hcGkuc2xhY2suY29tL2RpYWxvZ3MjaW5wdXRfdmFsaWRhdGlvbikuIEl0IG1heSBhbHNvIGJlIGEgUHJvbWlzZSBmb3JcbiAqIGEgbGlzdCBvZiB2YWxpZGF0aW9uIGVycm9ycywgYW5kIGlmIHNvIGFuZCB0aGUgUHJvbWlzZSB0YWtlcyBsb25nZXIgdGhhbiB0aGVcbiAqIGBzeW5jUmVwb25zZVRpbWVvdXRgIHRvIGNvbXBsZXRlLCBTbGFjayB3aWxsIGRpc3BseSBhbiBlcnJvciB0byB0aGUgdXNlci4gSWYgdGhlcmUgaXMgbm8gcmV0dXJuXG4gKiB2YWx1ZSwgdGhlbiBidXR0b24gcHJlc3NlcyBhbmQgbWVudSBzZWxlY3Rpb25zIGRvIG5vdCB1cGRhdGUgdGhlIG1lc3NhZ2UgYW5kIGRpYWxvZyBzdWJtaXNzaW9uc1xuICogd2lsbCB2YWxpZGF0ZSBhbmQgZGlzbWlzcy5cbiAqL1xuXG4vKipcbiAqIEEgZnVuY3Rpb24gdXNlZCB0byBzZW5kIG1lc3NhZ2UgdXBkYXRlcyBhZnRlciBhbiBhY3Rpb24gaXMgaGFuZGxlZC4gVGhpcyBmdW5jdGlvbiBjYW4gYmUgdXNlZFxuICogdXAgdG8gNSB0aW1lcyBpbiAzMCBtaW51dGVzLlxuICpcbiAqIEBuYW1lIG1vZHVsZTphZGFwdGVyflNsYWNrTWVzc2FnZUFkYXB0ZXJ+QWN0aW9uSGFuZGxlcn5SZXNwb25kXG4gKiBAZnVuY3Rpb25cbiAqIEBwYXJhbSB7T2JqZWN0fSBtZXNzYWdlIC0gYVxuICogW21lc3NhZ2VdKGh0dHBzOi8vYXBpLnNsYWNrLmNvbS9kb2NzL2ludGVyYWN0aXZlLW1lc3NhZ2UtZmllbGQtZ3VpZGUjdG9wLWxldmVsX21lc3NhZ2VfZmllbGRzKS5cbiAqIERpYWxvZyBzdWJtaXNzaW9ucyBkbyBub3QgYWxsb3cgYHJlc3BsYWNlX29yaWdpbmFsOiBmYWxzZWAgb24gdGhpcyBtZXNzYWdlLlxuICogQHJldHVybnMge1Byb21pc2V9IHRoZXJlJ3Mgbm8gY29udHJhY3Qgb3IgaW50ZXJmYWNlIGZvciB0aGUgcmVzb2x1dGlvbiB2YWx1ZSwgYnV0IHRoaXMgUHJvbWlzZVxuICogd2lsbCByZXNvbHZlIHdoZW4gdGhlIEhUVFAgcmVzcG9uc2UgZnJvbSB0aGUgYHJlc3BvbnNlX3VybGAgcmVxdWVzdCBpcyBjb21wbGV0ZSBhbmQgcmVqZWN0IHdoZW5cbiAqIHRoZXJlIGlzIGFuIGVycm9yLlxuICovXG5cbi8qKlxuICogQSBoYW5kbGVyIGZ1bmN0aW9uIGZvciBtZW51IG9wdGlvbnMgcmVxdWVzdHMuXG4gKlxuICogQG5hbWUgbW9kdWxlOmFkYXB0ZXJ+U2xhY2tNZXNzYWdlQWRhcHRlcn5PcHRpb25zSGFuZGxlclxuICogQGZ1bmN0aW9uXG4gKiBAcGFyYW0ge09iamVjdH0gcGF5bG9hZCAtIGFuIG9iamVjdCBkZXNjcmliaW5nXG4gKiBbdGhlIHN0YXRlIG9mIHRoZSBtZW51XShodHRwczovL2FwaS5zbGFjay5jb20vZG9jcy9tZXNzYWdlLW1lbnVzI29wdGlvbnNfbG9hZF91cmwpXG4gKiBAcmV0dXJucyB7T2JqZWN0fSBhblxuICogW29wdGlvbnMgbGlzdF0oaHR0cHM6Ly9hcGkuc2xhY2suY29tL2RvY3MvaW50ZXJhY3RpdmUtbWVzc2FnZS1maWVsZC1ndWlkZSNvcHRpb25fZmllbGRzKSBvclxuICogW29wdGlvbiBncm91cHMgbGlzdF0oaHR0cHM6Ly9hcGkuc2xhY2suY29tL2RvY3MvaW50ZXJhY3RpdmUtbWVzc2FnZS1maWVsZC1ndWlkZSNvcHRpb25fZ3JvdXBzKS5cbiAqIFdoZW4gdGhlIG1lbnUgaXMgd2l0aGluIGFuIGludGVyYWN0aXZlIG1lc3NhZ2UsIChgd2l0aGluOiAnaW50ZXJhY3RpdmVfbWVzc2FnZSdgKSB0aGUgb3B0aW9uXG4gKiBrZXlzIGFyZSBgdGV4dGAgYW5kIGB2YWx1ZWAuIFdoZW4gdGhlIG1lbnUgaXMgd2l0aGluIGEgZGlhbG9nIChgd2l0aGluOiAnZGlhbG9nJ2ApIHRoZSBvcHRpb25cbiAqIGtleXMgYXJlIGBsYWJlbGAgYW5kIGB2YWx1ZWAuIFdoZW4gdGhlIG1lbnUgaXMgd2l0aGluIGEgZGlhbG9nIChgd2l0aGluOiAnYmxvY2tfYWN0aW9ucydgKSB0aGVcbiAqIG9wdGlvbiBrZXlzIGFyZSBhIHRleHQgYmxvY2sgYW5kIGB2YWx1ZWAuIFRoaXMgZnVuY3Rpb24gbWF5IGFsc28gcmV0dXJuIGEgUHJvbWlzZSBlaXRoZXIgb2ZcbiAqIHRoZXNlIHZhbHVlcy4gSWYgYSBQcm9taXNlIGlzIHJldHVybmVkIGFuZCBpdCBkb2VzIG5vdCBjb21wbGV0ZSB3aXRoaW4gMyBzZWNvbmRzLCBTbGFjayB3aWxsXG4gKiBkaXNwbGF5IGFuIGVycm9yIHRvIHRoZSB1c2VyLiBJZiB0aGVyZSBpcyBubyByZXR1cm4gdmFsdWUsIHRoZW4gdGhlIHVzZXIgaXMgc2hvd24gYW4gZW1wdHkgbGlzdFxuICogb2Ygb3B0aW9ucy5cbiAqL1xuIl19
//# sourceMappingURL=adapter.js.map