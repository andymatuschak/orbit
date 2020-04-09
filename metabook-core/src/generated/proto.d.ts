import * as $protobuf from "protobufjs";
/** Properties of a Prompt. */
export interface IPrompt {

    /** Prompt basicPrompt */
    basicPrompt?: (IQuestionAnswerPrompt|null);

    /** Prompt applicationPrompt */
    applicationPrompt?: (IApplicationPrompt|null);

    /** Prompt clozePrompt */
    clozePrompt?: (IClozePrompt|null);
}

/** Represents a Prompt. */
export class Prompt implements IPrompt {

    /**
     * Constructs a new Prompt.
     * @param [properties] Properties to set
     */
    constructor(properties?: IPrompt);

    /** Prompt basicPrompt. */
    public basicPrompt?: (IQuestionAnswerPrompt|null);

    /** Prompt applicationPrompt. */
    public applicationPrompt?: (IApplicationPrompt|null);

    /** Prompt clozePrompt. */
    public clozePrompt?: (IClozePrompt|null);

    /** Prompt prompt. */
    public prompt?: ("basicPrompt"|"applicationPrompt"|"clozePrompt");

    /**
     * Creates a new Prompt instance using the specified properties.
     * @param [properties] Properties to set
     * @returns Prompt instance
     */
    public static create(properties?: IPrompt): Prompt;

    /**
     * Encodes the specified Prompt message. Does not implicitly {@link Prompt.verify|verify} messages.
     * @param message Prompt message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(message: IPrompt, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Encodes the specified Prompt message, length delimited. Does not implicitly {@link Prompt.verify|verify} messages.
     * @param message Prompt message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(message: IPrompt, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes a Prompt message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns Prompt
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): Prompt;

    /**
     * Decodes a Prompt message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns Prompt
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): Prompt;

    /**
     * Verifies a Prompt message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): (string|null);

    /**
     * Creates a Prompt message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns Prompt
     */
    public static fromObject(object: { [k: string]: any }): Prompt;

    /**
     * Creates a plain object from a Prompt message. Also converts values to other types if specified.
     * @param message Prompt
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(message: Prompt, options?: $protobuf.IConversionOptions): { [k: string]: any };

    /**
     * Converts this Prompt to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };
}

/** Properties of an ApplicationPrompt. */
export interface IApplicationPrompt {

    /** ApplicationPrompt variants */
    variants?: (IQuestionAnswerPrompt[]|null);
}

/** Represents an ApplicationPrompt. */
export class ApplicationPrompt implements IApplicationPrompt {

    /**
     * Constructs a new ApplicationPrompt.
     * @param [properties] Properties to set
     */
    constructor(properties?: IApplicationPrompt);

    /** ApplicationPrompt variants. */
    public variants: IQuestionAnswerPrompt[];

    /**
     * Creates a new ApplicationPrompt instance using the specified properties.
     * @param [properties] Properties to set
     * @returns ApplicationPrompt instance
     */
    public static create(properties?: IApplicationPrompt): ApplicationPrompt;

    /**
     * Encodes the specified ApplicationPrompt message. Does not implicitly {@link ApplicationPrompt.verify|verify} messages.
     * @param message ApplicationPrompt message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(message: IApplicationPrompt, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Encodes the specified ApplicationPrompt message, length delimited. Does not implicitly {@link ApplicationPrompt.verify|verify} messages.
     * @param message ApplicationPrompt message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(message: IApplicationPrompt, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes an ApplicationPrompt message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns ApplicationPrompt
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): ApplicationPrompt;

    /**
     * Decodes an ApplicationPrompt message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns ApplicationPrompt
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): ApplicationPrompt;

    /**
     * Verifies an ApplicationPrompt message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): (string|null);

    /**
     * Creates an ApplicationPrompt message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns ApplicationPrompt
     */
    public static fromObject(object: { [k: string]: any }): ApplicationPrompt;

    /**
     * Creates a plain object from an ApplicationPrompt message. Also converts values to other types if specified.
     * @param message ApplicationPrompt
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(message: ApplicationPrompt, options?: $protobuf.IConversionOptions): { [k: string]: any };

    /**
     * Converts this ApplicationPrompt to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };
}

/** Properties of a QuestionAnswerPrompt. */
export interface IQuestionAnswerPrompt {

    /** QuestionAnswerPrompt question */
    question?: (string|null);

    /** QuestionAnswerPrompt answer */
    answer?: (string|null);

    /** QuestionAnswerPrompt explanation */
    explanation?: (string|null);
}

/** Represents a QuestionAnswerPrompt. */
export class QuestionAnswerPrompt implements IQuestionAnswerPrompt {

    /**
     * Constructs a new QuestionAnswerPrompt.
     * @param [properties] Properties to set
     */
    constructor(properties?: IQuestionAnswerPrompt);

    /** QuestionAnswerPrompt question. */
    public question: string;

    /** QuestionAnswerPrompt answer. */
    public answer: string;

    /** QuestionAnswerPrompt explanation. */
    public explanation: string;

    /**
     * Creates a new QuestionAnswerPrompt instance using the specified properties.
     * @param [properties] Properties to set
     * @returns QuestionAnswerPrompt instance
     */
    public static create(properties?: IQuestionAnswerPrompt): QuestionAnswerPrompt;

    /**
     * Encodes the specified QuestionAnswerPrompt message. Does not implicitly {@link QuestionAnswerPrompt.verify|verify} messages.
     * @param message QuestionAnswerPrompt message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(message: IQuestionAnswerPrompt, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Encodes the specified QuestionAnswerPrompt message, length delimited. Does not implicitly {@link QuestionAnswerPrompt.verify|verify} messages.
     * @param message QuestionAnswerPrompt message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(message: IQuestionAnswerPrompt, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes a QuestionAnswerPrompt message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns QuestionAnswerPrompt
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): QuestionAnswerPrompt;

    /**
     * Decodes a QuestionAnswerPrompt message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns QuestionAnswerPrompt
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): QuestionAnswerPrompt;

    /**
     * Verifies a QuestionAnswerPrompt message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): (string|null);

    /**
     * Creates a QuestionAnswerPrompt message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns QuestionAnswerPrompt
     */
    public static fromObject(object: { [k: string]: any }): QuestionAnswerPrompt;

    /**
     * Creates a plain object from a QuestionAnswerPrompt message. Also converts values to other types if specified.
     * @param message QuestionAnswerPrompt
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(message: QuestionAnswerPrompt, options?: $protobuf.IConversionOptions): { [k: string]: any };

    /**
     * Converts this QuestionAnswerPrompt to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };
}

/** Properties of a ClozePrompt. */
export interface IClozePrompt {

    /** ClozePrompt body */
    body?: (string|null);
}

/** Represents a ClozePrompt. */
export class ClozePrompt implements IClozePrompt {

    /**
     * Constructs a new ClozePrompt.
     * @param [properties] Properties to set
     */
    constructor(properties?: IClozePrompt);

    /** ClozePrompt body. */
    public body: string;

    /**
     * Creates a new ClozePrompt instance using the specified properties.
     * @param [properties] Properties to set
     * @returns ClozePrompt instance
     */
    public static create(properties?: IClozePrompt): ClozePrompt;

    /**
     * Encodes the specified ClozePrompt message. Does not implicitly {@link ClozePrompt.verify|verify} messages.
     * @param message ClozePrompt message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(message: IClozePrompt, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Encodes the specified ClozePrompt message, length delimited. Does not implicitly {@link ClozePrompt.verify|verify} messages.
     * @param message ClozePrompt message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(message: IClozePrompt, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes a ClozePrompt message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns ClozePrompt
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): ClozePrompt;

    /**
     * Decodes a ClozePrompt message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns ClozePrompt
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): ClozePrompt;

    /**
     * Verifies a ClozePrompt message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): (string|null);

    /**
     * Creates a ClozePrompt message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns ClozePrompt
     */
    public static fromObject(object: { [k: string]: any }): ClozePrompt;

    /**
     * Creates a plain object from a ClozePrompt message. Also converts values to other types if specified.
     * @param message ClozePrompt
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(message: ClozePrompt, options?: $protobuf.IConversionOptions): { [k: string]: any };

    /**
     * Converts this ClozePrompt to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };
}

/** Properties of an ActionLog. */
export interface IActionLog {

    /** ActionLog timestamp */
    timestamp?: (google.protobuf.ITimestamp|null);

    /** ActionLog ingest */
    ingest?: (ActionLog.IIngest|null);

    /** ActionLog repetition */
    repetition?: (ActionLog.IRepetition|null);
}

/** Represents an ActionLog. */
export class ActionLog implements IActionLog {

    /**
     * Constructs a new ActionLog.
     * @param [properties] Properties to set
     */
    constructor(properties?: IActionLog);

    /** ActionLog timestamp. */
    public timestamp?: (google.protobuf.ITimestamp|null);

    /** ActionLog ingest. */
    public ingest?: (ActionLog.IIngest|null);

    /** ActionLog repetition. */
    public repetition?: (ActionLog.IRepetition|null);

    /** ActionLog log. */
    public log?: ("ingest"|"repetition");

    /**
     * Creates a new ActionLog instance using the specified properties.
     * @param [properties] Properties to set
     * @returns ActionLog instance
     */
    public static create(properties?: IActionLog): ActionLog;

    /**
     * Encodes the specified ActionLog message. Does not implicitly {@link ActionLog.verify|verify} messages.
     * @param message ActionLog message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(message: IActionLog, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Encodes the specified ActionLog message, length delimited. Does not implicitly {@link ActionLog.verify|verify} messages.
     * @param message ActionLog message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(message: IActionLog, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes an ActionLog message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns ActionLog
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): ActionLog;

    /**
     * Decodes an ActionLog message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns ActionLog
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): ActionLog;

    /**
     * Verifies an ActionLog message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): (string|null);

    /**
     * Creates an ActionLog message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns ActionLog
     */
    public static fromObject(object: { [k: string]: any }): ActionLog;

    /**
     * Creates a plain object from an ActionLog message. Also converts values to other types if specified.
     * @param message ActionLog
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(message: ActionLog, options?: $protobuf.IConversionOptions): { [k: string]: any };

    /**
     * Converts this ActionLog to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };
}

export namespace ActionLog {

    /** Properties of an Ingest. */
    interface IIngest {

        /** Ingest taskID */
        taskID?: (string|null);
    }

    /** Represents an Ingest. */
    class Ingest implements IIngest {

        /**
         * Constructs a new Ingest.
         * @param [properties] Properties to set
         */
        constructor(properties?: ActionLog.IIngest);

        /** Ingest taskID. */
        public taskID: string;

        /**
         * Creates a new Ingest instance using the specified properties.
         * @param [properties] Properties to set
         * @returns Ingest instance
         */
        public static create(properties?: ActionLog.IIngest): ActionLog.Ingest;

        /**
         * Encodes the specified Ingest message. Does not implicitly {@link ActionLog.Ingest.verify|verify} messages.
         * @param message Ingest message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encode(message: ActionLog.IIngest, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified Ingest message, length delimited. Does not implicitly {@link ActionLog.Ingest.verify|verify} messages.
         * @param message Ingest message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encodeDelimited(message: ActionLog.IIngest, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes an Ingest message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns Ingest
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): ActionLog.Ingest;

        /**
         * Decodes an Ingest message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns Ingest
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): ActionLog.Ingest;

        /**
         * Verifies an Ingest message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        public static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates an Ingest message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns Ingest
         */
        public static fromObject(object: { [k: string]: any }): ActionLog.Ingest;

        /**
         * Creates a plain object from an Ingest message. Also converts values to other types if specified.
         * @param message Ingest
         * @param [options] Conversion options
         * @returns Plain object
         */
        public static toObject(message: ActionLog.Ingest, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this Ingest to JSON.
         * @returns JSON object
         */
        public toJSON(): { [k: string]: any };
    }

    /** Properties of a Repetition. */
    interface IRepetition {

        /** Repetition taskID */
        taskID?: (string|null);

        /** Repetition taskParameters */
        taskParameters?: (string|null);

        /** Repetition outcome */
        outcome?: (string|null);

        /** Repetition context */
        context?: (string|null);
    }

    /** Represents a Repetition. */
    class Repetition implements IRepetition {

        /**
         * Constructs a new Repetition.
         * @param [properties] Properties to set
         */
        constructor(properties?: ActionLog.IRepetition);

        /** Repetition taskID. */
        public taskID: string;

        /** Repetition taskParameters. */
        public taskParameters: string;

        /** Repetition outcome. */
        public outcome: string;

        /** Repetition context. */
        public context: string;

        /**
         * Creates a new Repetition instance using the specified properties.
         * @param [properties] Properties to set
         * @returns Repetition instance
         */
        public static create(properties?: ActionLog.IRepetition): ActionLog.Repetition;

        /**
         * Encodes the specified Repetition message. Does not implicitly {@link ActionLog.Repetition.verify|verify} messages.
         * @param message Repetition message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encode(message: ActionLog.IRepetition, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified Repetition message, length delimited. Does not implicitly {@link ActionLog.Repetition.verify|verify} messages.
         * @param message Repetition message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encodeDelimited(message: ActionLog.IRepetition, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a Repetition message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns Repetition
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): ActionLog.Repetition;

        /**
         * Decodes a Repetition message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns Repetition
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): ActionLog.Repetition;

        /**
         * Verifies a Repetition message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        public static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates a Repetition message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns Repetition
         */
        public static fromObject(object: { [k: string]: any }): ActionLog.Repetition;

        /**
         * Creates a plain object from a Repetition message. Also converts values to other types if specified.
         * @param message Repetition
         * @param [options] Conversion options
         * @returns Plain object
         */
        public static toObject(message: ActionLog.Repetition, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this Repetition to JSON.
         * @returns JSON object
         */
        public toJSON(): { [k: string]: any };
    }
}

/** Namespace google. */
export namespace google {

    /** Namespace protobuf. */
    namespace protobuf {

        /** Properties of a Timestamp. */
        interface ITimestamp {

            /** Timestamp seconds */
            seconds?: (number|Long|null);

            /** Timestamp nanos */
            nanos?: (number|null);
        }

        /** Represents a Timestamp. */
        class Timestamp implements ITimestamp {

            /**
             * Constructs a new Timestamp.
             * @param [properties] Properties to set
             */
            constructor(properties?: google.protobuf.ITimestamp);

            /** Timestamp seconds. */
            public seconds: (number|Long);

            /** Timestamp nanos. */
            public nanos: number;

            /**
             * Creates a new Timestamp instance using the specified properties.
             * @param [properties] Properties to set
             * @returns Timestamp instance
             */
            public static create(properties?: google.protobuf.ITimestamp): google.protobuf.Timestamp;

            /**
             * Encodes the specified Timestamp message. Does not implicitly {@link google.protobuf.Timestamp.verify|verify} messages.
             * @param message Timestamp message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            public static encode(message: google.protobuf.ITimestamp, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Encodes the specified Timestamp message, length delimited. Does not implicitly {@link google.protobuf.Timestamp.verify|verify} messages.
             * @param message Timestamp message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            public static encodeDelimited(message: google.protobuf.ITimestamp, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Decodes a Timestamp message from the specified reader or buffer.
             * @param reader Reader or buffer to decode from
             * @param [length] Message length if known beforehand
             * @returns Timestamp
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): google.protobuf.Timestamp;

            /**
             * Decodes a Timestamp message from the specified reader or buffer, length delimited.
             * @param reader Reader or buffer to decode from
             * @returns Timestamp
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): google.protobuf.Timestamp;

            /**
             * Verifies a Timestamp message.
             * @param message Plain object to verify
             * @returns `null` if valid, otherwise the reason why it is not
             */
            public static verify(message: { [k: string]: any }): (string|null);

            /**
             * Creates a Timestamp message from a plain object. Also converts values to their respective internal types.
             * @param object Plain object
             * @returns Timestamp
             */
            public static fromObject(object: { [k: string]: any }): google.protobuf.Timestamp;

            /**
             * Creates a plain object from a Timestamp message. Also converts values to other types if specified.
             * @param message Timestamp
             * @param [options] Conversion options
             * @returns Plain object
             */
            public static toObject(message: google.protobuf.Timestamp, options?: $protobuf.IConversionOptions): { [k: string]: any };

            /**
             * Converts this Timestamp to JSON.
             * @returns JSON object
             */
            public toJSON(): { [k: string]: any };
        }
    }
}
