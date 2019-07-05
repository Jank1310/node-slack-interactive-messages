'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.errorCodes = undefined;

var _slicedToArray = function () { function sliceIterator(arr, i) { var _arr = []; var _n = true; var _d = false; var _e = undefined; try { for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) { _arr.push(_s.value); if (i && _arr.length === i) break; } } catch (err) { _d = true; _e = err; } finally { try { if (!_n && _i["return"]) _i["return"](); } finally { if (_d) throw _e; } } return _arr; } return function (arr, i) { if (Array.isArray(arr)) { return arr; } else if (Symbol.iterator in Object(arr)) { return sliceIterator(arr, i); } else { throw new TypeError("Invalid attempt to destructure non-iterable instance"); } }; }();

exports.verifyRequestSignature = verifyRequestSignature;
exports.createHTTPHandler = createHTTPHandler;

var _debug = require('debug');

var _debug2 = _interopRequireDefault(_debug);

var _rawBody = require('raw-body');

var _rawBody2 = _interopRequireDefault(_rawBody);

var _querystring = require('querystring');

var _querystring2 = _interopRequireDefault(_querystring);

var _crypto = require('crypto');

var _crypto2 = _interopRequireDefault(_crypto);

var _tsscmp = require('tsscmp');

var _tsscmp2 = _interopRequireDefault(_tsscmp);

var _util = require('./util');

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var debug = (0, _debug2.default)('@slack/interactive-messages:http-handler');

var errorCodes = exports.errorCodes = {
  SIGNATURE_VERIFICATION_FAILURE: 'SLACKHTTPHANDLER_REQUEST_SIGNATURE_VERIFICATION_FAILURE',
  REQUEST_TIME_FAILURE: 'SLACKHTTPHANDLER_REQUEST_TIMELIMIT_FAILURE',
  BODY_PARSER_NOT_PERMITTED: 'SLACKADAPTER_BODY_PARSER_NOT_PERMITTED_FAILURE'
};

/**
 * Method to verify signature of requests
 *
 * @param {string} signingSecret - Signing secret used to verify request signature
 * @param {string} requestSignature - Signature from request 'x-slack-signature' header
 * @param {number} requestTimestamp - Timestamp from request 'x-slack-request-timestamp' header
 * @param {string} body - Raw body string
 * @returns {boolean} Indicates if request is verified
 */
function verifyRequestSignature(_ref) {
  var signingSecret = _ref.signingSecret,
      requestSignature = _ref.requestSignature,
      requestTimestamp = _ref.requestTimestamp,
      body = _ref.body;

  // Divide current date to match Slack ts format
  // Subtract 5 minutes from current time
  var fiveMinutesAgo = Math.floor(Date.now() / 1000) - 60 * 5;

  if (requestTimestamp < fiveMinutesAgo) {
    debug('request is older than 5 minutes');
    var error = new Error('Slack request signing verification outdated');
    error.code = errorCodes.REQUEST_TIME_FAILURE;
    throw error;
  }

  var hmac = _crypto2.default.createHmac('sha256', signingSecret);

  var _requestSignature$spl = requestSignature.split('='),
      _requestSignature$spl2 = _slicedToArray(_requestSignature$spl, 2),
      version = _requestSignature$spl2[0],
      hash = _requestSignature$spl2[1];

  hmac.update(`${version}:${requestTimestamp}:${body}`);

  if (!(0, _tsscmp2.default)(hash, hmac.digest('hex'))) {
    debug('request signature is not valid');
    var _error = new Error('Slack request signing verification failed');
    _error.code = errorCodes.SIGNATURE_VERIFICATION_FAILURE;
    throw _error;
  }

  debug('request signing verification success');
  return true;
}

function createHTTPHandler(adapter) {
  var poweredBy = (0, _util.packageIdentifier)();

  /**
   * Handles sending responses
   *
   * @param {Object} res - Response object
   * @returns {Function} Returns a function used to send response
   */
  function sendResponse(res) {
    return function _sendResponse(dispatchResult) {
      var status = dispatchResult.status,
          content = dispatchResult.content;

      res.statusCode = status;
      res.setHeader('X-Slack-Powered-By', poweredBy);
      if (typeof content === 'string') {
        res.end(content);
      } else if (content) {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(content));
      } else {
        res.end();
      }
    };
  }

  /**
   * Parses raw bodies of requests
   *
   * @param {string} body - Raw body of request
   * @returns {Object} Parsed body of the request
   */
  function parseBody(body) {
    var parsedBody = _querystring2.default.parse(body);
    if (parsedBody.payload) {
      return JSON.parse(parsedBody.payload);
    }

    return parsedBody;
  }

  /**
   * Abstracts error handling.
   *
   * @param {Error} error
   * @param {Function} respond
   */
  function handleError(error, respond) {
    debug('handling error - message: %s, code: %s', error.message, error.code);
    try {
      if (error.code === errorCodes.SIGNATURE_VERIFICATION_FAILURE || error.code === errorCodes.REQUEST_TIME_FAILURE) {
        respond({ status: 404 });
      } else if (process.env.NODE_ENV === 'development') {
        respond({ status: 500, content: error.message });
      } else {
        respond({ status: 500 });
      }
    } catch (userError) {
      process.nextTick(function () {
        throw userError;
      });
    }
  }

  /**
   * Request listener used to handle Slack requests and send responses and
   * verify request signatures
   *
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  return function slackRequestListener(req, res) {
    debug('request received - method: %s, path: %s', req.method, req.url);

    // Bind a response function to this request's respond object.
    var respond = sendResponse(res);

    // If parser is being used and we don't receive the raw payload via `rawBody`,
    // we can't verify request signature
    if (req.body && !req.rawBody) {
      var error = new Error('Parsing request body prohibits request signature verification');
      error.code = errorCodes.BODY_PARSER_NOT_PERMITTED;
      handleError(error, respond);
      return;
    }

    // Some serverless cloud providers (e.g. Google Firebase Cloud Functions) might populate
    // the request with a bodyparser before it can be populated by the SDK.
    // To prevent throwing an error here, we check the `rawBody` field before parsing the request
    // through the `raw-body` module (see Issue #85 - https://github.com/slackapi/node-slack-events-api/issues/85)
    var parseRawBody = void 0;
    if (req.rawBody) {
      debug('Parsing request with a rawBody attribute');
      parseRawBody = new Promise(function (resolve) {
        resolve(req.rawBody);
      });
    } else {
      debug('Parsing raw request');
      parseRawBody = (0, _rawBody2.default)(req);
    }

    parseRawBody.then(function (r) {
      var rawBody = r.toString();

      if (verifyRequestSignature({
        signingSecret: adapter.signingSecret,
        requestSignature: req.headers['x-slack-signature'],
        requestTimestamp: req.headers['x-slack-request-timestamp'],
        body: rawBody
      })) {
        // Request signature is verified
        // Parse raw body
        var body = parseBody(rawBody);

        if (body.ssl_check) {
          respond({ status: 200 });
          return;
        }

        var dispatchResult = adapter.dispatch(body);

        if (dispatchResult) {
          dispatchResult.then(respond);
        } else {
          // No callback was matched
          debug('no callback was matched');
          respond({ status: 404 });
        }
      }
    }).catch(function (error) {
      if (error.code === errorCodes.SIGNATURE_VERIFICATION_FAILURE || error.code === errorCodes.REQUEST_TIME_FAILURE) {
        respond({ status: 404 });
      } else if (process.env.NODE_ENV === 'development') {
        respond({ status: 500, content: error.message });
      } else {
        respond({ status: 500 });
      }
    });
  };
}
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uL3NyYy9odHRwLWhhbmRsZXIuanMiXSwibmFtZXMiOlsidmVyaWZ5UmVxdWVzdFNpZ25hdHVyZSIsImNyZWF0ZUhUVFBIYW5kbGVyIiwiZGVidWciLCJlcnJvckNvZGVzIiwiU0lHTkFUVVJFX1ZFUklGSUNBVElPTl9GQUlMVVJFIiwiUkVRVUVTVF9USU1FX0ZBSUxVUkUiLCJCT0RZX1BBUlNFUl9OT1RfUEVSTUlUVEVEIiwic2lnbmluZ1NlY3JldCIsInJlcXVlc3RTaWduYXR1cmUiLCJyZXF1ZXN0VGltZXN0YW1wIiwiYm9keSIsImZpdmVNaW51dGVzQWdvIiwiTWF0aCIsImZsb29yIiwiRGF0ZSIsIm5vdyIsImVycm9yIiwiRXJyb3IiLCJjb2RlIiwiaG1hYyIsImNyeXB0byIsImNyZWF0ZUhtYWMiLCJzcGxpdCIsInZlcnNpb24iLCJoYXNoIiwidXBkYXRlIiwiZGlnZXN0IiwiYWRhcHRlciIsInBvd2VyZWRCeSIsInNlbmRSZXNwb25zZSIsInJlcyIsIl9zZW5kUmVzcG9uc2UiLCJkaXNwYXRjaFJlc3VsdCIsInN0YXR1cyIsImNvbnRlbnQiLCJzdGF0dXNDb2RlIiwic2V0SGVhZGVyIiwiZW5kIiwiSlNPTiIsInN0cmluZ2lmeSIsInBhcnNlQm9keSIsInBhcnNlZEJvZHkiLCJxdWVyeXN0cmluZyIsInBhcnNlIiwicGF5bG9hZCIsImhhbmRsZUVycm9yIiwicmVzcG9uZCIsIm1lc3NhZ2UiLCJwcm9jZXNzIiwiZW52IiwiTk9ERV9FTlYiLCJ1c2VyRXJyb3IiLCJuZXh0VGljayIsInNsYWNrUmVxdWVzdExpc3RlbmVyIiwicmVxIiwibWV0aG9kIiwidXJsIiwicmF3Qm9keSIsInBhcnNlUmF3Qm9keSIsIlByb21pc2UiLCJyZXNvbHZlIiwidGhlbiIsInIiLCJ0b1N0cmluZyIsImhlYWRlcnMiLCJzc2xfY2hlY2siLCJkaXNwYXRjaCIsImNhdGNoIl0sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7UUF3QmdCQSxzQixHQUFBQSxzQjtRQTZCQUMsaUIs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QUFDRCxPQUhELE1BR08sSUFBSWUsUUFBUUMsR0FBUixDQUFZQyxRQUFaLEtBQXlCLGFBQTdCLEVBQTRDO0FBQ2pESixnQkFBUSxFQUFFYixRQUFRLEdBQVYsRUFBZUMsU0FBU2xCLE1BQU0rQixPQUE5QixFQUFSO0FBQ0QsT0FGTSxNQUVBO0FBQ0xELGdCQUFRLEVBQUViLFFBQVEsR0FBVixFQUFSO0FBQ0Q7QUFDRixLQXZDSDtBQXdDRCxHQXRFRDtBQXVFRCIsImZpbGUiOiJodHRwLWhhbmRsZXIuanMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgZGVidWdGYWN0b3J5IGZyb20gJ2RlYnVnJztcbmltcG9ydCBnZXRSYXdCb2R5IGZyb20gJ3Jhdy1ib2R5JztcbmltcG9ydCBxdWVyeXN0cmluZyBmcm9tICdxdWVyeXN0cmluZyc7XG5pbXBvcnQgY3J5cHRvIGZyb20gJ2NyeXB0byc7XG5pbXBvcnQgdGltaW5nU2FmZUNvbXBhcmUgZnJvbSAndHNzY21wJztcbmltcG9ydCB7IHBhY2thZ2VJZGVudGlmaWVyIH0gZnJvbSAnLi91dGlsJztcblxuY29uc3QgZGVidWcgPSBkZWJ1Z0ZhY3RvcnkoJ0BzbGFjay9pbnRlcmFjdGl2ZS1tZXNzYWdlczpodHRwLWhhbmRsZXInKTtcblxuZXhwb3J0IGNvbnN0IGVycm9yQ29kZXMgPSB7XG4gIFNJR05BVFVSRV9WRVJJRklDQVRJT05fRkFJTFVSRTogJ1NMQUNLSFRUUEhBTkRMRVJfUkVRVUVTVF9TSUdOQVRVUkVfVkVSSUZJQ0FUSU9OX0ZBSUxVUkUnLFxuICBSRVFVRVNUX1RJTUVfRkFJTFVSRTogJ1NMQUNLSFRUUEhBTkRMRVJfUkVRVUVTVF9USU1FTElNSVRfRkFJTFVSRScsXG4gIEJPRFlfUEFSU0VSX05PVF9QRVJNSVRURUQ6ICdTTEFDS0FEQVBURVJfQk9EWV9QQVJTRVJfTk9UX1BFUk1JVFRFRF9GQUlMVVJFJyxcbn07XG5cbi8qKlxuICogTWV0aG9kIHRvIHZlcmlmeSBzaWduYXR1cmUgb2YgcmVxdWVzdHNcbiAqXG4gKiBAcGFyYW0ge3N0cmluZ30gc2lnbmluZ1NlY3JldCAtIFNpZ25pbmcgc2VjcmV0IHVzZWQgdG8gdmVyaWZ5IHJlcXVlc3Qgc2lnbmF0dXJlXG4gKiBAcGFyYW0ge3N0cmluZ30gcmVxdWVzdFNpZ25hdHVyZSAtIFNpZ25hdHVyZSBmcm9tIHJlcXVlc3QgJ3gtc2xhY2stc2lnbmF0dXJlJyBoZWFkZXJcbiAqIEBwYXJhbSB7bnVtYmVyfSByZXF1ZXN0VGltZXN0YW1wIC0gVGltZXN0YW1wIGZyb20gcmVxdWVzdCAneC1zbGFjay1yZXF1ZXN0LXRpbWVzdGFtcCcgaGVhZGVyXG4gKiBAcGFyYW0ge3N0cmluZ30gYm9keSAtIFJhdyBib2R5IHN0cmluZ1xuICogQHJldHVybnMge2Jvb2xlYW59IEluZGljYXRlcyBpZiByZXF1ZXN0IGlzIHZlcmlmaWVkXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiB2ZXJpZnlSZXF1ZXN0U2lnbmF0dXJlKHtcbiAgc2lnbmluZ1NlY3JldCwgcmVxdWVzdFNpZ25hdHVyZSwgcmVxdWVzdFRpbWVzdGFtcCwgYm9keSxcbn0pIHtcbiAgLy8gRGl2aWRlIGN1cnJlbnQgZGF0ZSB0byBtYXRjaCBTbGFjayB0cyBmb3JtYXRcbiAgLy8gU3VidHJhY3QgNSBtaW51dGVzIGZyb20gY3VycmVudCB0aW1lXG4gIGNvbnN0IGZpdmVNaW51dGVzQWdvID0gTWF0aC5mbG9vcihEYXRlLm5vdygpIC8gMTAwMCkgLSAoNjAgKiA1KTtcblxuICBpZiAocmVxdWVzdFRpbWVzdGFtcCA8IGZpdmVNaW51dGVzQWdvKSB7XG4gICAgZGVidWcoJ3JlcXVlc3QgaXMgb2xkZXIgdGhhbiA1IG1pbnV0ZXMnKTtcbiAgICBjb25zdCBlcnJvciA9IG5ldyBFcnJvcignU2xhY2sgcmVxdWVzdCBzaWduaW5nIHZlcmlmaWNhdGlvbiBvdXRkYXRlZCcpO1xuICAgIGVycm9yLmNvZGUgPSBlcnJvckNvZGVzLlJFUVVFU1RfVElNRV9GQUlMVVJFO1xuICAgIHRocm93IGVycm9yO1xuICB9XG5cbiAgY29uc3QgaG1hYyA9IGNyeXB0by5jcmVhdGVIbWFjKCdzaGEyNTYnLCBzaWduaW5nU2VjcmV0KTtcbiAgY29uc3QgW3ZlcnNpb24sIGhhc2hdID0gcmVxdWVzdFNpZ25hdHVyZS5zcGxpdCgnPScpO1xuICBobWFjLnVwZGF0ZShgJHt2ZXJzaW9ufToke3JlcXVlc3RUaW1lc3RhbXB9OiR7Ym9keX1gKTtcblxuICBpZiAoIXRpbWluZ1NhZmVDb21wYXJlKGhhc2gsIGhtYWMuZGlnZXN0KCdoZXgnKSkpIHtcbiAgICBkZWJ1ZygncmVxdWVzdCBzaWduYXR1cmUgaXMgbm90IHZhbGlkJyk7XG4gICAgY29uc3QgZXJyb3IgPSBuZXcgRXJyb3IoJ1NsYWNrIHJlcXVlc3Qgc2lnbmluZyB2ZXJpZmljYXRpb24gZmFpbGVkJyk7XG4gICAgZXJyb3IuY29kZSA9IGVycm9yQ29kZXMuU0lHTkFUVVJFX1ZFUklGSUNBVElPTl9GQUlMVVJFO1xuICAgIHRocm93IGVycm9yO1xuICB9XG5cbiAgZGVidWcoJ3JlcXVlc3Qgc2lnbmluZyB2ZXJpZmljYXRpb24gc3VjY2VzcycpO1xuICByZXR1cm4gdHJ1ZTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZUhUVFBIYW5kbGVyKGFkYXB0ZXIpIHtcbiAgY29uc3QgcG93ZXJlZEJ5ID0gcGFja2FnZUlkZW50aWZpZXIoKTtcblxuICAvKipcbiAgICogSGFuZGxlcyBzZW5kaW5nIHJlc3BvbnNlc1xuICAgKlxuICAgKiBAcGFyYW0ge09iamVjdH0gcmVzIC0gUmVzcG9uc2Ugb2JqZWN0XG4gICAqIEByZXR1cm5zIHtGdW5jdGlvbn0gUmV0dXJucyBhIGZ1bmN0aW9uIHVzZWQgdG8gc2VuZCByZXNwb25zZVxuICAgKi9cbiAgZnVuY3Rpb24gc2VuZFJlc3BvbnNlKHJlcykge1xuICAgIHJldHVybiBmdW5jdGlvbiBfc2VuZFJlc3BvbnNlKGRpc3BhdGNoUmVzdWx0KSB7XG4gICAgICBjb25zdCB7IHN0YXR1cywgY29udGVudCB9ID0gZGlzcGF0Y2hSZXN1bHQ7XG4gICAgICByZXMuc3RhdHVzQ29kZSA9IHN0YXR1cztcbiAgICAgIHJlcy5zZXRIZWFkZXIoJ1gtU2xhY2stUG93ZXJlZC1CeScsIHBvd2VyZWRCeSk7XG4gICAgICBpZiAodHlwZW9mIGNvbnRlbnQgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgIHJlcy5lbmQoY29udGVudCk7XG4gICAgICB9IGVsc2UgaWYgKGNvbnRlbnQpIHtcbiAgICAgICAgcmVzLnNldEhlYWRlcignQ29udGVudC1UeXBlJywgJ2FwcGxpY2F0aW9uL2pzb24nKTtcbiAgICAgICAgcmVzLmVuZChKU09OLnN0cmluZ2lmeShjb250ZW50KSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXMuZW5kKCk7XG4gICAgICB9XG4gICAgfTtcbiAgfVxuXG4gIC8qKlxuICAgKiBQYXJzZXMgcmF3IGJvZGllcyBvZiByZXF1ZXN0c1xuICAgKlxuICAgKiBAcGFyYW0ge3N0cmluZ30gYm9keSAtIFJhdyBib2R5IG9mIHJlcXVlc3RcbiAgICogQHJldHVybnMge09iamVjdH0gUGFyc2VkIGJvZHkgb2YgdGhlIHJlcXVlc3RcbiAgICovXG4gIGZ1bmN0aW9uIHBhcnNlQm9keShib2R5KSB7XG4gICAgY29uc3QgcGFyc2VkQm9keSA9IHF1ZXJ5c3RyaW5nLnBhcnNlKGJvZHkpO1xuICAgIGlmIChwYXJzZWRCb2R5LnBheWxvYWQpIHtcbiAgICAgIHJldHVybiBKU09OLnBhcnNlKHBhcnNlZEJvZHkucGF5bG9hZCk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHBhcnNlZEJvZHk7XG4gIH1cblxuXG4gIC8qKlxuICAgKiBBYnN0cmFjdHMgZXJyb3IgaGFuZGxpbmcuXG4gICAqXG4gICAqIEBwYXJhbSB7RXJyb3J9IGVycm9yXG4gICAqIEBwYXJhbSB7RnVuY3Rpb259IHJlc3BvbmRcbiAgICovXG4gIGZ1bmN0aW9uIGhhbmRsZUVycm9yKGVycm9yLCByZXNwb25kKSB7XG4gICAgZGVidWcoJ2hhbmRsaW5nIGVycm9yIC0gbWVzc2FnZTogJXMsIGNvZGU6ICVzJywgZXJyb3IubWVzc2FnZSwgZXJyb3IuY29kZSk7XG4gICAgdHJ5IHtcbiAgICAgIGlmIChlcnJvci5jb2RlID09PSBlcnJvckNvZGVzLlNJR05BVFVSRV9WRVJJRklDQVRJT05fRkFJTFVSRSB8fFxuICAgICAgICAgIGVycm9yLmNvZGUgPT09IGVycm9yQ29kZXMuUkVRVUVTVF9USU1FX0ZBSUxVUkUpIHtcbiAgICAgICAgcmVzcG9uZCh7IHN0YXR1czogNDA0IH0pO1xuICAgICAgfSBlbHNlIGlmIChwcm9jZXNzLmVudi5OT0RFX0VOViA9PT0gJ2RldmVsb3BtZW50Jykge1xuICAgICAgICByZXNwb25kKHsgc3RhdHVzOiA1MDAsIGNvbnRlbnQ6IGVycm9yLm1lc3NhZ2UgfSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXNwb25kKHsgc3RhdHVzOiA1MDAgfSk7XG4gICAgICB9XG4gICAgfSBjYXRjaCAodXNlckVycm9yKSB7XG4gICAgICBwcm9jZXNzLm5leHRUaWNrKCgpID0+IHsgdGhyb3cgdXNlckVycm9yOyB9KTtcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogUmVxdWVzdCBsaXN0ZW5lciB1c2VkIHRvIGhhbmRsZSBTbGFjayByZXF1ZXN0cyBhbmQgc2VuZCByZXNwb25zZXMgYW5kXG4gICAqIHZlcmlmeSByZXF1ZXN0IHNpZ25hdHVyZXNcbiAgICpcbiAgICogQHBhcmFtIHtPYmplY3R9IHJlcSAtIFJlcXVlc3Qgb2JqZWN0XG4gICAqIEBwYXJhbSB7T2JqZWN0fSByZXMgLSBSZXNwb25zZSBvYmplY3RcbiAgICovXG4gIHJldHVybiBmdW5jdGlvbiBzbGFja1JlcXVlc3RMaXN0ZW5lcihyZXEsIHJlcykge1xuICAgIGRlYnVnKCdyZXF1ZXN0IHJlY2VpdmVkIC0gbWV0aG9kOiAlcywgcGF0aDogJXMnLCByZXEubWV0aG9kLCByZXEudXJsKTtcblxuICAgIC8vIEJpbmQgYSByZXNwb25zZSBmdW5jdGlvbiB0byB0aGlzIHJlcXVlc3QncyByZXNwb25kIG9iamVjdC5cbiAgICBjb25zdCByZXNwb25kID0gc2VuZFJlc3BvbnNlKHJlcyk7XG5cbiAgICAvLyBJZiBwYXJzZXIgaXMgYmVpbmcgdXNlZCBhbmQgd2UgZG9uJ3QgcmVjZWl2ZSB0aGUgcmF3IHBheWxvYWQgdmlhIGByYXdCb2R5YCxcbiAgICAvLyB3ZSBjYW4ndCB2ZXJpZnkgcmVxdWVzdCBzaWduYXR1cmVcbiAgICBpZiAocmVxLmJvZHkgJiYgIXJlcS5yYXdCb2R5KSB7XG4gICAgICBjb25zdCBlcnJvciA9IG5ldyBFcnJvcignUGFyc2luZyByZXF1ZXN0IGJvZHkgcHJvaGliaXRzIHJlcXVlc3Qgc2lnbmF0dXJlIHZlcmlmaWNhdGlvbicpO1xuICAgICAgZXJyb3IuY29kZSA9IGVycm9yQ29kZXMuQk9EWV9QQVJTRVJfTk9UX1BFUk1JVFRFRDtcbiAgICAgIGhhbmRsZUVycm9yKGVycm9yLCByZXNwb25kKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICAvLyBTb21lIHNlcnZlcmxlc3MgY2xvdWQgcHJvdmlkZXJzIChlLmcuIEdvb2dsZSBGaXJlYmFzZSBDbG91ZCBGdW5jdGlvbnMpIG1pZ2h0IHBvcHVsYXRlXG4gICAgLy8gdGhlIHJlcXVlc3Qgd2l0aCBhIGJvZHlwYXJzZXIgYmVmb3JlIGl0IGNhbiBiZSBwb3B1bGF0ZWQgYnkgdGhlIFNESy5cbiAgICAvLyBUbyBwcmV2ZW50IHRocm93aW5nIGFuIGVycm9yIGhlcmUsIHdlIGNoZWNrIHRoZSBgcmF3Qm9keWAgZmllbGQgYmVmb3JlIHBhcnNpbmcgdGhlIHJlcXVlc3RcbiAgICAvLyB0aHJvdWdoIHRoZSBgcmF3LWJvZHlgIG1vZHVsZSAoc2VlIElzc3VlICM4NSAtIGh0dHBzOi8vZ2l0aHViLmNvbS9zbGFja2FwaS9ub2RlLXNsYWNrLWV2ZW50cy1hcGkvaXNzdWVzLzg1KVxuICAgIGxldCBwYXJzZVJhd0JvZHk7XG4gICAgaWYgKHJlcS5yYXdCb2R5KSB7XG4gICAgICBkZWJ1ZygnUGFyc2luZyByZXF1ZXN0IHdpdGggYSByYXdCb2R5IGF0dHJpYnV0ZScpO1xuICAgICAgcGFyc2VSYXdCb2R5ID0gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgICAgcmVzb2x2ZShyZXEucmF3Qm9keSk7XG4gICAgICB9KTtcbiAgICB9IGVsc2Uge1xuICAgICAgZGVidWcoJ1BhcnNpbmcgcmF3IHJlcXVlc3QnKTtcbiAgICAgIHBhcnNlUmF3Qm9keSA9IGdldFJhd0JvZHkocmVxKTtcbiAgICB9XG5cbiAgICBwYXJzZVJhd0JvZHlcbiAgICAgIC50aGVuKChyKSA9PiB7XG4gICAgICAgIGNvbnN0IHJhd0JvZHkgPSByLnRvU3RyaW5nKCk7XG5cbiAgICAgICAgaWYgKHZlcmlmeVJlcXVlc3RTaWduYXR1cmUoe1xuICAgICAgICAgIHNpZ25pbmdTZWNyZXQ6IGFkYXB0ZXIuc2lnbmluZ1NlY3JldCxcbiAgICAgICAgICByZXF1ZXN0U2lnbmF0dXJlOiByZXEuaGVhZGVyc1sneC1zbGFjay1zaWduYXR1cmUnXSxcbiAgICAgICAgICByZXF1ZXN0VGltZXN0YW1wOiByZXEuaGVhZGVyc1sneC1zbGFjay1yZXF1ZXN0LXRpbWVzdGFtcCddLFxuICAgICAgICAgIGJvZHk6IHJhd0JvZHksXG4gICAgICAgIH0pXG4gICAgICAgICkge1xuICAgICAgICAgIC8vIFJlcXVlc3Qgc2lnbmF0dXJlIGlzIHZlcmlmaWVkXG4gICAgICAgICAgLy8gUGFyc2UgcmF3IGJvZHlcbiAgICAgICAgICBjb25zdCBib2R5ID0gcGFyc2VCb2R5KHJhd0JvZHkpO1xuXG4gICAgICAgICAgaWYgKGJvZHkuc3NsX2NoZWNrKSB7XG4gICAgICAgICAgICByZXNwb25kKHsgc3RhdHVzOiAyMDAgfSk7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgY29uc3QgZGlzcGF0Y2hSZXN1bHQgPSBhZGFwdGVyLmRpc3BhdGNoKGJvZHkpO1xuXG4gICAgICAgICAgaWYgKGRpc3BhdGNoUmVzdWx0KSB7XG4gICAgICAgICAgICBkaXNwYXRjaFJlc3VsdC50aGVuKHJlc3BvbmQpO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAvLyBObyBjYWxsYmFjayB3YXMgbWF0Y2hlZFxuICAgICAgICAgICAgZGVidWcoJ25vIGNhbGxiYWNrIHdhcyBtYXRjaGVkJyk7XG4gICAgICAgICAgICByZXNwb25kKHsgc3RhdHVzOiA0MDQgfSk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9KS5jYXRjaCgoZXJyb3IpID0+IHtcbiAgICAgICAgaWYgKGVycm9yLmNvZGUgPT09IGVycm9yQ29kZXMuU0lHTkFUVVJFX1ZFUklGSUNBVElPTl9GQUlMVVJFIHx8XG4gICAgICAgICAgICBlcnJvci5jb2RlID09PSBlcnJvckNvZGVzLlJFUVVFU1RfVElNRV9GQUlMVVJFKSB7XG4gICAgICAgICAgcmVzcG9uZCh7IHN0YXR1czogNDA0IH0pO1xuICAgICAgICB9IGVsc2UgaWYgKHByb2Nlc3MuZW52Lk5PREVfRU5WID09PSAnZGV2ZWxvcG1lbnQnKSB7XG4gICAgICAgICAgcmVzcG9uZCh7IHN0YXR1czogNTAwLCBjb250ZW50OiBlcnJvci5tZXNzYWdlIH0pO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHJlc3BvbmQoeyBzdGF0dXM6IDUwMCB9KTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gIH07XG59XG4iXX0=
//# sourceMappingURL=http-handler.js.map