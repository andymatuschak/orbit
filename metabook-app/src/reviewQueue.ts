import { MetabookDataClient } from "metabook-client";
import { ReviewItem } from "metabook-ui";
import DataRecordCache from "./model/dataRecordCache";

class ReviewQueue {
  private dataClient: MetabookDataClient;
  private dataCache: DataRecordCache;

  constructor(dataClient: MetabookDataClient, dataCache: DataRecordCache) {
    this.dataClient = dataClient;
    this.dataCache = dataCache;
  }

  subscribeToReviewItems(
    onUpdate: (reviewItems: ReviewItem[]) => void,
    onError: (error: Error) => void,
  ): () => void {}
}
