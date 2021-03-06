import { MatDialog } from '@angular/material/dialog';
import { CarDialogComponent } from 'app/pages/cars/car/car.dialog.component';
import { CarButtonAction } from 'app/types/Car';
import { TableActionDef } from 'app/types/Table';
import { Observable } from 'rxjs';

import { TableCreateAction } from './table-create-action';

export class TableCreateCarAction extends TableCreateAction {
  public getActionDef(): TableActionDef {
    return {
      ...super.getActionDef(),
      id: CarButtonAction.CREATE_CAR,
      action: this.createCar,
    };
  }

  private createCar(dialog: MatDialog, refresh?: () => Observable<void>) {
    super.create(CarDialogComponent, dialog, refresh);
  }
}
