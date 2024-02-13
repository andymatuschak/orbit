// Consistent SQL database types to unify React Native and Node SQL implementations.
// Adapted from @expo/sqlite, which are in turn adapted from @types/websql.

/*
Notice required by @expo/sqlite's MIT license:

Copyright (c) 2015-present 650 Industries, Inc. (aka Expo)

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/

export interface SQLDatabaseCallback {
  (database: SQLDatabaseBinding): void;
}

export interface SQLDatabaseBinding {
  executeSql(sqlStatement: string, args?: any[]): Promise<SQLResult>;
  transaction(continuation: (t: SQLTransaction) => void): Promise<void>;
}

export interface SQLTransaction {
  executeSql(sqlStatement: string, args?: any[]): void;
}

export interface SQLResult {
  rows: any[];
}
