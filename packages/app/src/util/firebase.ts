// Web implementation of Firebase interface; see firebase.native.ts for native implementation.
import firebase from "firebase/app";
import "firebase/auth";
import "firebase/functions";

import serviceConfig from "../../serviceConfig.js";

let _app: firebase.app.App | null;
export function getDefaultFirebaseApp(): firebase.app.App {
  if (!_app) {
    _app = firebase.initializeApp({
      apiKey: "AIzaSyAwlVFBlx4D3s3eSrwOvUyqOKr_DXFmj0c",
      authDomain: "metabook-system.firebaseapp.com",
      databaseURL: "https://metabook-system.firebaseio.com",
      projectId: "metabook-system",
      storageBucket: "metabook-system.appspot.com",
      messagingSenderId: "748053153064",
      appId: "1:748053153064:web:efc2dfbc9ac11d8512bc1d",
    });
  }
  return _app;
}

let _auth: firebase.auth.Auth | null = null;
export function getFirebaseAuth(): firebase.auth.Auth {
  if (!_auth) {
    _auth = getDefaultFirebaseApp().auth();
    if (serviceConfig.shouldUseLocalBackend) {
      _auth.useEmulator("http://localhost:9099/");
    }
  }
  return _auth;
}
