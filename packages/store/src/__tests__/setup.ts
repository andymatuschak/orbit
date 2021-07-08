import fetchMock from "jest-fetch-mock";
fetchMock.enableMocks();

// Disable by default; we'll enable within tests, where needed.
fetchMock.dontMock();
