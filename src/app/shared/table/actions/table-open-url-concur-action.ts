import { TableActionDef } from 'app/types/Table';
import { TransactionButtonAction } from 'app/types/Transaction';

import { TableOpenURLAction } from './table-open-url-action';

export class TableOpenURLConcurAction extends TableOpenURLAction {
  // Return an action
  public getActionDef(): TableActionDef {
    return {
      ...super.getActionDef(),
      id: TransactionButtonAction.OPEN_CONCUR_URL,
      name: 'general.open_in_concur',
    };
  }
}
