/*eslint-disable block-scoped-var, id-length, no-control-regex, no-magic-numbers, no-prototype-builtins, no-redeclare, no-shadow, no-var, sort-vars*/
"use strict";

var $protobuf = require("protobufjs/minimal");

// Common aliases
var $Reader = $protobuf.Reader, $Writer = $protobuf.Writer, $util = $protobuf.util;

// Exported root namespace
var $root = $protobuf.roots["default"] || ($protobuf.roots["default"] = {});

$root.Prompt = (function() {

    /**
     * Properties of a Prompt.
     * @exports IPrompt
     * @interface IPrompt
     * @property {IQuestionAnswer|null} [basicPrompt] Prompt basicPrompt
     * @property {IApplicationPrompt|null} [applicationPrompt] Prompt applicationPrompt
     */

    /**
     * Constructs a new Prompt.
     * @exports Prompt
     * @classdesc Represents a Prompt.
     * @implements IPrompt
     * @constructor
     * @param {IPrompt=} [properties] Properties to set
     */
    function Prompt(properties) {
        if (properties)
            for (var keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                if (properties[keys[i]] != null)
                    this[keys[i]] = properties[keys[i]];
    }

    /**
     * Prompt basicPrompt.
     * @member {IQuestionAnswer|null|undefined} basicPrompt
     * @memberof Prompt
     * @instance
     */
    Prompt.prototype.basicPrompt = null;

    /**
     * Prompt applicationPrompt.
     * @member {IApplicationPrompt|null|undefined} applicationPrompt
     * @memberof Prompt
     * @instance
     */
    Prompt.prototype.applicationPrompt = null;

    // OneOf field names bound to virtual getters and setters
    var $oneOfFields;

    /**
     * Prompt prompt.
     * @member {"basicPrompt"|"applicationPrompt"|undefined} prompt
     * @memberof Prompt
     * @instance
     */
    Object.defineProperty(Prompt.prototype, "prompt", {
        get: $util.oneOfGetter($oneOfFields = ["basicPrompt", "applicationPrompt"]),
        set: $util.oneOfSetter($oneOfFields)
    });

    /**
     * Creates a new Prompt instance using the specified properties.
     * @function create
     * @memberof Prompt
     * @static
     * @param {IPrompt=} [properties] Properties to set
     * @returns {Prompt} Prompt instance
     */
    Prompt.create = function create(properties) {
        return new Prompt(properties);
    };

    /**
     * Encodes the specified Prompt message. Does not implicitly {@link Prompt.verify|verify} messages.
     * @function encode
     * @memberof Prompt
     * @static
     * @param {IPrompt} message Prompt message or plain object to encode
     * @param {$protobuf.Writer} [writer] Writer to encode to
     * @returns {$protobuf.Writer} Writer
     */
    Prompt.encode = function encode(message, writer) {
        if (!writer)
            writer = $Writer.create();
        if (message.basicPrompt != null && message.hasOwnProperty("basicPrompt"))
            $root.QuestionAnswer.encode(message.basicPrompt, writer.uint32(/* id 1, wireType 2 =*/10).fork()).ldelim();
        if (message.applicationPrompt != null && message.hasOwnProperty("applicationPrompt"))
            $root.ApplicationPrompt.encode(message.applicationPrompt, writer.uint32(/* id 2, wireType 2 =*/18).fork()).ldelim();
        return writer;
    };

    /**
     * Encodes the specified Prompt message, length delimited. Does not implicitly {@link Prompt.verify|verify} messages.
     * @function encodeDelimited
     * @memberof Prompt
     * @static
     * @param {IPrompt} message Prompt message or plain object to encode
     * @param {$protobuf.Writer} [writer] Writer to encode to
     * @returns {$protobuf.Writer} Writer
     */
    Prompt.encodeDelimited = function encodeDelimited(message, writer) {
        return this.encode(message, writer).ldelim();
    };

    /**
     * Decodes a Prompt message from the specified reader or buffer.
     * @function decode
     * @memberof Prompt
     * @static
     * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
     * @param {number} [length] Message length if known beforehand
     * @returns {Prompt} Prompt
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    Prompt.decode = function decode(reader, length) {
        if (!(reader instanceof $Reader))
            reader = $Reader.create(reader);
        var end = length === undefined ? reader.len : reader.pos + length, message = new $root.Prompt();
        while (reader.pos < end) {
            var tag = reader.uint32();
            switch (tag >>> 3) {
            case 1:
                message.basicPrompt = $root.QuestionAnswer.decode(reader, reader.uint32());
                break;
            case 2:
                message.applicationPrompt = $root.ApplicationPrompt.decode(reader, reader.uint32());
                break;
            default:
                reader.skipType(tag & 7);
                break;
            }
        }
        return message;
    };

    /**
     * Decodes a Prompt message from the specified reader or buffer, length delimited.
     * @function decodeDelimited
     * @memberof Prompt
     * @static
     * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
     * @returns {Prompt} Prompt
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    Prompt.decodeDelimited = function decodeDelimited(reader) {
        if (!(reader instanceof $Reader))
            reader = new $Reader(reader);
        return this.decode(reader, reader.uint32());
    };

    /**
     * Verifies a Prompt message.
     * @function verify
     * @memberof Prompt
     * @static
     * @param {Object.<string,*>} message Plain object to verify
     * @returns {string|null} `null` if valid, otherwise the reason why it is not
     */
    Prompt.verify = function verify(message) {
        if (typeof message !== "object" || message === null)
            return "object expected";
        var properties = {};
        if (message.basicPrompt != null && message.hasOwnProperty("basicPrompt")) {
            properties.prompt = 1;
            {
                var error = $root.QuestionAnswer.verify(message.basicPrompt);
                if (error)
                    return "basicPrompt." + error;
            }
        }
        if (message.applicationPrompt != null && message.hasOwnProperty("applicationPrompt")) {
            if (properties.prompt === 1)
                return "prompt: multiple values";
            properties.prompt = 1;
            {
                var error = $root.ApplicationPrompt.verify(message.applicationPrompt);
                if (error)
                    return "applicationPrompt." + error;
            }
        }
        return null;
    };

    /**
     * Creates a Prompt message from a plain object. Also converts values to their respective internal types.
     * @function fromObject
     * @memberof Prompt
     * @static
     * @param {Object.<string,*>} object Plain object
     * @returns {Prompt} Prompt
     */
    Prompt.fromObject = function fromObject(object) {
        if (object instanceof $root.Prompt)
            return object;
        var message = new $root.Prompt();
        if (object.basicPrompt != null) {
            if (typeof object.basicPrompt !== "object")
                throw TypeError(".Prompt.basicPrompt: object expected");
            message.basicPrompt = $root.QuestionAnswer.fromObject(object.basicPrompt);
        }
        if (object.applicationPrompt != null) {
            if (typeof object.applicationPrompt !== "object")
                throw TypeError(".Prompt.applicationPrompt: object expected");
            message.applicationPrompt = $root.ApplicationPrompt.fromObject(object.applicationPrompt);
        }
        return message;
    };

    /**
     * Creates a plain object from a Prompt message. Also converts values to other types if specified.
     * @function toObject
     * @memberof Prompt
     * @static
     * @param {Prompt} message Prompt
     * @param {$protobuf.IConversionOptions} [options] Conversion options
     * @returns {Object.<string,*>} Plain object
     */
    Prompt.toObject = function toObject(message, options) {
        if (!options)
            options = {};
        var object = {};
        if (message.basicPrompt != null && message.hasOwnProperty("basicPrompt")) {
            object.basicPrompt = $root.QuestionAnswer.toObject(message.basicPrompt, options);
            if (options.oneofs)
                object.prompt = "basicPrompt";
        }
        if (message.applicationPrompt != null && message.hasOwnProperty("applicationPrompt")) {
            object.applicationPrompt = $root.ApplicationPrompt.toObject(message.applicationPrompt, options);
            if (options.oneofs)
                object.prompt = "applicationPrompt";
        }
        return object;
    };

    /**
     * Converts this Prompt to JSON.
     * @function toJSON
     * @memberof Prompt
     * @instance
     * @returns {Object.<string,*>} JSON object
     */
    Prompt.prototype.toJSON = function toJSON() {
        return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
    };

    return Prompt;
})();

$root.ApplicationPrompt = (function() {

    /**
     * Properties of an ApplicationPrompt.
     * @exports IApplicationPrompt
     * @interface IApplicationPrompt
     * @property {Array.<IQuestionAnswer>|null} [variants] ApplicationPrompt variants
     */

    /**
     * Constructs a new ApplicationPrompt.
     * @exports ApplicationPrompt
     * @classdesc Represents an ApplicationPrompt.
     * @implements IApplicationPrompt
     * @constructor
     * @param {IApplicationPrompt=} [properties] Properties to set
     */
    function ApplicationPrompt(properties) {
        this.variants = [];
        if (properties)
            for (var keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                if (properties[keys[i]] != null)
                    this[keys[i]] = properties[keys[i]];
    }

    /**
     * ApplicationPrompt variants.
     * @member {Array.<IQuestionAnswer>} variants
     * @memberof ApplicationPrompt
     * @instance
     */
    ApplicationPrompt.prototype.variants = $util.emptyArray;

    /**
     * Creates a new ApplicationPrompt instance using the specified properties.
     * @function create
     * @memberof ApplicationPrompt
     * @static
     * @param {IApplicationPrompt=} [properties] Properties to set
     * @returns {ApplicationPrompt} ApplicationPrompt instance
     */
    ApplicationPrompt.create = function create(properties) {
        return new ApplicationPrompt(properties);
    };

    /**
     * Encodes the specified ApplicationPrompt message. Does not implicitly {@link ApplicationPrompt.verify|verify} messages.
     * @function encode
     * @memberof ApplicationPrompt
     * @static
     * @param {IApplicationPrompt} message ApplicationPrompt message or plain object to encode
     * @param {$protobuf.Writer} [writer] Writer to encode to
     * @returns {$protobuf.Writer} Writer
     */
    ApplicationPrompt.encode = function encode(message, writer) {
        if (!writer)
            writer = $Writer.create();
        if (message.variants != null && message.variants.length)
            for (var i = 0; i < message.variants.length; ++i)
                $root.QuestionAnswer.encode(message.variants[i], writer.uint32(/* id 1, wireType 2 =*/10).fork()).ldelim();
        return writer;
    };

    /**
     * Encodes the specified ApplicationPrompt message, length delimited. Does not implicitly {@link ApplicationPrompt.verify|verify} messages.
     * @function encodeDelimited
     * @memberof ApplicationPrompt
     * @static
     * @param {IApplicationPrompt} message ApplicationPrompt message or plain object to encode
     * @param {$protobuf.Writer} [writer] Writer to encode to
     * @returns {$protobuf.Writer} Writer
     */
    ApplicationPrompt.encodeDelimited = function encodeDelimited(message, writer) {
        return this.encode(message, writer).ldelim();
    };

    /**
     * Decodes an ApplicationPrompt message from the specified reader or buffer.
     * @function decode
     * @memberof ApplicationPrompt
     * @static
     * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
     * @param {number} [length] Message length if known beforehand
     * @returns {ApplicationPrompt} ApplicationPrompt
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    ApplicationPrompt.decode = function decode(reader, length) {
        if (!(reader instanceof $Reader))
            reader = $Reader.create(reader);
        var end = length === undefined ? reader.len : reader.pos + length, message = new $root.ApplicationPrompt();
        while (reader.pos < end) {
            var tag = reader.uint32();
            switch (tag >>> 3) {
            case 1:
                if (!(message.variants && message.variants.length))
                    message.variants = [];
                message.variants.push($root.QuestionAnswer.decode(reader, reader.uint32()));
                break;
            default:
                reader.skipType(tag & 7);
                break;
            }
        }
        return message;
    };

    /**
     * Decodes an ApplicationPrompt message from the specified reader or buffer, length delimited.
     * @function decodeDelimited
     * @memberof ApplicationPrompt
     * @static
     * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
     * @returns {ApplicationPrompt} ApplicationPrompt
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    ApplicationPrompt.decodeDelimited = function decodeDelimited(reader) {
        if (!(reader instanceof $Reader))
            reader = new $Reader(reader);
        return this.decode(reader, reader.uint32());
    };

    /**
     * Verifies an ApplicationPrompt message.
     * @function verify
     * @memberof ApplicationPrompt
     * @static
     * @param {Object.<string,*>} message Plain object to verify
     * @returns {string|null} `null` if valid, otherwise the reason why it is not
     */
    ApplicationPrompt.verify = function verify(message) {
        if (typeof message !== "object" || message === null)
            return "object expected";
        if (message.variants != null && message.hasOwnProperty("variants")) {
            if (!Array.isArray(message.variants))
                return "variants: array expected";
            for (var i = 0; i < message.variants.length; ++i) {
                var error = $root.QuestionAnswer.verify(message.variants[i]);
                if (error)
                    return "variants." + error;
            }
        }
        return null;
    };

    /**
     * Creates an ApplicationPrompt message from a plain object. Also converts values to their respective internal types.
     * @function fromObject
     * @memberof ApplicationPrompt
     * @static
     * @param {Object.<string,*>} object Plain object
     * @returns {ApplicationPrompt} ApplicationPrompt
     */
    ApplicationPrompt.fromObject = function fromObject(object) {
        if (object instanceof $root.ApplicationPrompt)
            return object;
        var message = new $root.ApplicationPrompt();
        if (object.variants) {
            if (!Array.isArray(object.variants))
                throw TypeError(".ApplicationPrompt.variants: array expected");
            message.variants = [];
            for (var i = 0; i < object.variants.length; ++i) {
                if (typeof object.variants[i] !== "object")
                    throw TypeError(".ApplicationPrompt.variants: object expected");
                message.variants[i] = $root.QuestionAnswer.fromObject(object.variants[i]);
            }
        }
        return message;
    };

    /**
     * Creates a plain object from an ApplicationPrompt message. Also converts values to other types if specified.
     * @function toObject
     * @memberof ApplicationPrompt
     * @static
     * @param {ApplicationPrompt} message ApplicationPrompt
     * @param {$protobuf.IConversionOptions} [options] Conversion options
     * @returns {Object.<string,*>} Plain object
     */
    ApplicationPrompt.toObject = function toObject(message, options) {
        if (!options)
            options = {};
        var object = {};
        if (options.arrays || options.defaults)
            object.variants = [];
        if (message.variants && message.variants.length) {
            object.variants = [];
            for (var j = 0; j < message.variants.length; ++j)
                object.variants[j] = $root.QuestionAnswer.toObject(message.variants[j], options);
        }
        return object;
    };

    /**
     * Converts this ApplicationPrompt to JSON.
     * @function toJSON
     * @memberof ApplicationPrompt
     * @instance
     * @returns {Object.<string,*>} JSON object
     */
    ApplicationPrompt.prototype.toJSON = function toJSON() {
        return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
    };

    return ApplicationPrompt;
})();

$root.QuestionAnswer = (function() {

    /**
     * Properties of a QuestionAnswer.
     * @exports IQuestionAnswer
     * @interface IQuestionAnswer
     * @property {number|null} [version] QuestionAnswer version
     * @property {string|null} [question] QuestionAnswer question
     * @property {string|null} [answer] QuestionAnswer answer
     * @property {string|null} [explanation] QuestionAnswer explanation
     */

    /**
     * Constructs a new QuestionAnswer.
     * @exports QuestionAnswer
     * @classdesc Represents a QuestionAnswer.
     * @implements IQuestionAnswer
     * @constructor
     * @param {IQuestionAnswer=} [properties] Properties to set
     */
    function QuestionAnswer(properties) {
        if (properties)
            for (var keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                if (properties[keys[i]] != null)
                    this[keys[i]] = properties[keys[i]];
    }

    /**
     * QuestionAnswer version.
     * @member {number} version
     * @memberof QuestionAnswer
     * @instance
     */
    QuestionAnswer.prototype.version = 0;

    /**
     * QuestionAnswer question.
     * @member {string} question
     * @memberof QuestionAnswer
     * @instance
     */
    QuestionAnswer.prototype.question = "";

    /**
     * QuestionAnswer answer.
     * @member {string} answer
     * @memberof QuestionAnswer
     * @instance
     */
    QuestionAnswer.prototype.answer = "";

    /**
     * QuestionAnswer explanation.
     * @member {string} explanation
     * @memberof QuestionAnswer
     * @instance
     */
    QuestionAnswer.prototype.explanation = "";

    /**
     * Creates a new QuestionAnswer instance using the specified properties.
     * @function create
     * @memberof QuestionAnswer
     * @static
     * @param {IQuestionAnswer=} [properties] Properties to set
     * @returns {QuestionAnswer} QuestionAnswer instance
     */
    QuestionAnswer.create = function create(properties) {
        return new QuestionAnswer(properties);
    };

    /**
     * Encodes the specified QuestionAnswer message. Does not implicitly {@link QuestionAnswer.verify|verify} messages.
     * @function encode
     * @memberof QuestionAnswer
     * @static
     * @param {IQuestionAnswer} message QuestionAnswer message or plain object to encode
     * @param {$protobuf.Writer} [writer] Writer to encode to
     * @returns {$protobuf.Writer} Writer
     */
    QuestionAnswer.encode = function encode(message, writer) {
        if (!writer)
            writer = $Writer.create();
        if (message.version != null && message.hasOwnProperty("version"))
            writer.uint32(/* id 1, wireType 0 =*/8).uint32(message.version);
        if (message.question != null && message.hasOwnProperty("question"))
            writer.uint32(/* id 2, wireType 2 =*/18).string(message.question);
        if (message.answer != null && message.hasOwnProperty("answer"))
            writer.uint32(/* id 3, wireType 2 =*/26).string(message.answer);
        if (message.explanation != null && message.hasOwnProperty("explanation"))
            writer.uint32(/* id 4, wireType 2 =*/34).string(message.explanation);
        return writer;
    };

    /**
     * Encodes the specified QuestionAnswer message, length delimited. Does not implicitly {@link QuestionAnswer.verify|verify} messages.
     * @function encodeDelimited
     * @memberof QuestionAnswer
     * @static
     * @param {IQuestionAnswer} message QuestionAnswer message or plain object to encode
     * @param {$protobuf.Writer} [writer] Writer to encode to
     * @returns {$protobuf.Writer} Writer
     */
    QuestionAnswer.encodeDelimited = function encodeDelimited(message, writer) {
        return this.encode(message, writer).ldelim();
    };

    /**
     * Decodes a QuestionAnswer message from the specified reader or buffer.
     * @function decode
     * @memberof QuestionAnswer
     * @static
     * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
     * @param {number} [length] Message length if known beforehand
     * @returns {QuestionAnswer} QuestionAnswer
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    QuestionAnswer.decode = function decode(reader, length) {
        if (!(reader instanceof $Reader))
            reader = $Reader.create(reader);
        var end = length === undefined ? reader.len : reader.pos + length, message = new $root.QuestionAnswer();
        while (reader.pos < end) {
            var tag = reader.uint32();
            switch (tag >>> 3) {
            case 1:
                message.version = reader.uint32();
                break;
            case 2:
                message.question = reader.string();
                break;
            case 3:
                message.answer = reader.string();
                break;
            case 4:
                message.explanation = reader.string();
                break;
            default:
                reader.skipType(tag & 7);
                break;
            }
        }
        return message;
    };

    /**
     * Decodes a QuestionAnswer message from the specified reader or buffer, length delimited.
     * @function decodeDelimited
     * @memberof QuestionAnswer
     * @static
     * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
     * @returns {QuestionAnswer} QuestionAnswer
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    QuestionAnswer.decodeDelimited = function decodeDelimited(reader) {
        if (!(reader instanceof $Reader))
            reader = new $Reader(reader);
        return this.decode(reader, reader.uint32());
    };

    /**
     * Verifies a QuestionAnswer message.
     * @function verify
     * @memberof QuestionAnswer
     * @static
     * @param {Object.<string,*>} message Plain object to verify
     * @returns {string|null} `null` if valid, otherwise the reason why it is not
     */
    QuestionAnswer.verify = function verify(message) {
        if (typeof message !== "object" || message === null)
            return "object expected";
        if (message.version != null && message.hasOwnProperty("version"))
            if (!$util.isInteger(message.version))
                return "version: integer expected";
        if (message.question != null && message.hasOwnProperty("question"))
            if (!$util.isString(message.question))
                return "question: string expected";
        if (message.answer != null && message.hasOwnProperty("answer"))
            if (!$util.isString(message.answer))
                return "answer: string expected";
        if (message.explanation != null && message.hasOwnProperty("explanation"))
            if (!$util.isString(message.explanation))
                return "explanation: string expected";
        return null;
    };

    /**
     * Creates a QuestionAnswer message from a plain object. Also converts values to their respective internal types.
     * @function fromObject
     * @memberof QuestionAnswer
     * @static
     * @param {Object.<string,*>} object Plain object
     * @returns {QuestionAnswer} QuestionAnswer
     */
    QuestionAnswer.fromObject = function fromObject(object) {
        if (object instanceof $root.QuestionAnswer)
            return object;
        var message = new $root.QuestionAnswer();
        if (object.version != null)
            message.version = object.version >>> 0;
        if (object.question != null)
            message.question = String(object.question);
        if (object.answer != null)
            message.answer = String(object.answer);
        if (object.explanation != null)
            message.explanation = String(object.explanation);
        return message;
    };

    /**
     * Creates a plain object from a QuestionAnswer message. Also converts values to other types if specified.
     * @function toObject
     * @memberof QuestionAnswer
     * @static
     * @param {QuestionAnswer} message QuestionAnswer
     * @param {$protobuf.IConversionOptions} [options] Conversion options
     * @returns {Object.<string,*>} Plain object
     */
    QuestionAnswer.toObject = function toObject(message, options) {
        if (!options)
            options = {};
        var object = {};
        if (options.defaults) {
            object.version = 0;
            object.question = "";
            object.answer = "";
            object.explanation = "";
        }
        if (message.version != null && message.hasOwnProperty("version"))
            object.version = message.version;
        if (message.question != null && message.hasOwnProperty("question"))
            object.question = message.question;
        if (message.answer != null && message.hasOwnProperty("answer"))
            object.answer = message.answer;
        if (message.explanation != null && message.hasOwnProperty("explanation"))
            object.explanation = message.explanation;
        return object;
    };

    /**
     * Converts this QuestionAnswer to JSON.
     * @function toJSON
     * @memberof QuestionAnswer
     * @instance
     * @returns {Object.<string,*>} JSON object
     */
    QuestionAnswer.prototype.toJSON = function toJSON() {
        return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
    };

    return QuestionAnswer;
})();

module.exports = $root;
