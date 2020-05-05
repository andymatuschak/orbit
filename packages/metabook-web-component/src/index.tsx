import React from "react";
import ReactDOM from "react-dom";
import { Card, ReviewArea } from "metabook-ui-web";
import { StyleSheet } from "react-native-web";

(() => {
  class ReviewAreaElement extends HTMLElement {
    private needsRender = false;

    private mountPoint: HTMLElement | null = null;

    private protoCardIndex = 0;

    constructor() {
      super();
      this.onMark = this.onMark.bind(this);
    }

    connectedCallback() {
      const shadowRoot = this.attachShadow({ mode: "closed" });
      const styleNode = document.createElement("style");
      shadowRoot.appendChild(styleNode);
      StyleSheet.styleResolver.addSheet(styleNode.sheet);
      this.mountPoint = document.createElement("span");
      shadowRoot.appendChild(this.mountPoint);

      this.markNeedsRender();
    }

    markNeedsRender() {
      if (!this.needsRender) {
        this.needsRender = true;
        // TODO cancel on disconnect
        requestAnimationFrame(() => {
          this.render();
          this.needsRender = false;
        });
      }
    }

    private onMark() {
      this.protoCardIndex++;
      this.markNeedsRender();
    }

    private render() {
      if (!this.mountPoint) {
        return;
      }

      const cardElements: CardElement[] = Object.values(
        this.querySelectorAll<CardElement>(":scope > mb-card"),
      );

      ReactDOM.render(
        <ReviewArea
          items={cardElements
            .slice(this.protoCardIndex)
            .map((element, index) => ({
              type: "question",
              cardState: null, // TODO
              cardData: {
                cardID: index.toString(),
                promptType: "basic",
                question: element.getAttribute("question") || "<missing>",
                answer: element.getAttribute("answer") || "<missing>",
                questionAdjustments: null,
                answerAdjustments: null,
                explanation: null,
              },
              promptIndex: null,
            }))}
          onMark={this.onMark}
          onLogin={() => {
            return;
          }}
          schedule="aggressiveStart"
          shouldLabelApplicationPrompts={false}
        />,
        this.mountPoint,
      );
    }
  }

  class CardElement extends HTMLElement {
    private mountPoint: HTMLElement | null = null;

    connectedCallback() {
      const reviewArea = this.getReviewAreaParent();
      if (!reviewArea) {
        throw new Error("Card without review area: " + this.outerHTML);
      }
      reviewArea.markNeedsRender();
    }

    attributeChangedCallback() {
      this.getReviewAreaParent()?.markNeedsRender();
    }

    private getReviewAreaParent(): ReviewAreaElement | null {
      let currentElement: HTMLElement | null = this;
      do {
        currentElement = currentElement.parentElement;
      } while (
        currentElement !== null &&
        !(currentElement instanceof ReviewAreaElement)
      );
      return currentElement;
    }

    static get observedAttributes() {
      return ["question", "answer"];
    }
  }

  window.customElements.define("mb-reviewarea", ReviewAreaElement);
  window.customElements.define("mb-card", CardElement);
})();
