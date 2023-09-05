import { Dashboard } from "./Dashboard.generated";

export class Spec {
  public create(props: Dashboard) {
    return JSON.stringify(props);
  }
}
