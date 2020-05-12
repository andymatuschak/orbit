import { MetabookDataClient } from "metabook-client";
import { ReviewItem } from "metabook-ui";
import DataRecordStore from "./model/dataRecordStore";

class ReviewQueue {
  private dataClient: MetabookDataClient;
  private dataCache: DataRecordStore;

  constructor(dataClient: MetabookDataClient, dataCache: DataRecordStore) {
    this.dataClient = dataClient;
    this.dataCache = dataCache;
  }

  /*subscribeToReviewItems(
    onUpdate: (reviewItems: ReviewItem[]) => void,
    onError: (error: Error) => void,
  ): () => void {}*/
}
