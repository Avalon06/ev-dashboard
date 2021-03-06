import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { ErrorMessage } from 'app/types/InError';

@Component({
  templateUrl: './error-code-details-dialog.component.html',
})
export class ErrorCodeDetailsDialogComponent {
  public error!: ErrorMessage;

  constructor(
    protected dialogRef: MatDialogRef<ErrorCodeDetailsDialogComponent>,
    @Inject(MAT_DIALOG_DATA) data: any) {
    if (data) {
      this.error = data;
    }
  }

  public cancel() {
    this.dialogRef.close();
  }
}
