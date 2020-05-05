import { testBasicPrompt } from "metabook-sample-data";
import { promptReviewItemType, ReviewArea } from "metabook-ui";
import React from "react";
import "./App.css";

function App() {
  return (
    <div className="App">
      <ReviewArea
        items={[
          {
            reviewItemType: promptReviewItemType,
            attachmentResolutionMap: null,
            prompt: testBasicPrompt,
            promptParameters: null,
            promptState: null,
          },
        ]}
        onMark={() => {
          return;
        }}
        onLogin={() => {
          return;
        }}
        schedule="aggressiveStart"
        shouldLabelApplicationPrompts={false}
      />
      ,
    </div>
  );
}

export default App;
