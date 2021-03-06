import { FormControl, FormGroup } from '@angular/forms';
import { Router } from '@angular/router';
import { AppUnitPipe } from 'app/shared/formatters/app-unit.pipe';
import { Address } from 'app/types/Address';
import { ChargingStation, ChargingStationCurrentType, ChargingStationPowers, Connector, StaticLimitAmps } from 'app/types/ChargingStation';
import { KeyValue } from 'app/types/GlobalType';
import { MobileType } from 'app/types/Mobile';
import { User } from 'app/types/User';
import { BAD_REQUEST, CONFLICT, FORBIDDEN, UNAUTHORIZED } from 'http-status-codes';
import * as moment from 'moment';

import { CentralServerService } from '../services/central-server.service';
import { MessageService } from '../services/message.service';
import { ChargingStations } from './ChargingStations';

export class Utils {
  public static isEmptyArray(array: any[]): boolean {
    if (Array.isArray(array) && array.length > 0) {
      return false;
    }
    return true;
  }

  public static containsAddressGPSCoordinates(address: Address): boolean {
    // Check if GPS are available
    if (address && Utils.containsGPSCoordinates(address.coordinates)) {
      return true;
    }
    return false;
  }

  public static containsGPSCoordinates(coordinates: number[]): boolean {
    // Check if GPs are available
    if (coordinates && coordinates.length === 2 && coordinates[0] && coordinates[1]) {
      return true;
    }
    return false;
  }

  public static cloneJSonDocument(jsonDocument: object): object {
    return JSON.parse(JSON.stringify(jsonDocument));
  }

  public static validateEqual(formGroup: FormGroup, firstField: string, secondField: string) {
    const field1: FormControl = formGroup.controls[firstField] as FormControl;
    const field2: FormControl = formGroup.controls[secondField] as FormControl;

    // Null?
    if (!field1.value && !field2.value) {
      return null;
    }
    // Equals
    if (field1.value === field2.value) {
      return null;
    }
    // Not Equal
    return { notEqual: true };
  }

  public static toRgba(rgb: string, alpha: number): string {
    if (!rgb) {
      return '';
    }
    let rgba = rgb.replace(/rgb/i, 'rgba');
    rgba = rgba.replace(/\)/i, `,${alpha})`);
    return rgba;
  }

  public static objectHasProperty(object: object, key: string): boolean {
    return Object.prototype.hasOwnProperty.call(object, key);
  }

  public static formatBarColor(color: string): any {
    return {
      backgroundColor: Utils.toRgba(color, 1),
      borderColor: Utils.toRgba(color, 1),
      pointRadius: 0,
      pointHoverBackgroundColor: Utils.toRgba(color, 1),
      pointHoverBorderColor: '#fff',
      hoverBackgroundColor: Utils.toRgba(color, 0.8),
      hoverBorderColor: Utils.toRgba(color, 1),
    };
  }

  public static firstLetterInUpperCase(value: string): string {
    return value[0].toUpperCase() + value.substring(1);
  }

  public static formatLineColor(color: string): any {
    return {
      backgroundColor: Utils.toRgba(color, 0.2),
      borderColor: Utils.toRgba(color, 1),
      pointRadius: 0,
      pointHoverBackgroundColor: Utils.toRgba(color, 1),
      pointHoverBorderColor: '#fff',
      hoverBackgroundColor: Utils.toRgba(color, 0.8),
      hoverBorderColor: Utils.toRgba(color, 1),
    };
  }

  public static handleError(error: any, messageService: MessageService, errorMessage: string = '', params?: object) {
    console.log(`Error: ${errorMessage}: ${error}`);
    messageService.showErrorMessage(errorMessage, params);
  }

  public static isInMobileApp(): boolean {
    return Utils.getMobileVendor() !== null;
  }

  public static replaceSpecialCharsInCSVValueParam(value: string): string {
    return value ? value.replace(/\n/g, '') : '';
  }

  public static getChargingStationPowers(chargingStation: ChargingStation, connector?: Connector, forChargingProfile: boolean = false): ChargingStationPowers {
    const result: ChargingStationPowers = {
      notSupported: false,
      minAmp: StaticLimitAmps.MIN_LIMIT,
      minWatt: Utils.convertAmpToPowerWatts(chargingStation, StaticLimitAmps.MIN_LIMIT),
      maxAmp: StaticLimitAmps.MIN_LIMIT,
      maxWatt: Utils.convertAmpToPowerWatts(chargingStation, StaticLimitAmps.MIN_LIMIT),
      currentAmp: 0,
      currentWatt: 0,
    };
    // Check
    if (!chargingStation ||
        !chargingStation.connectors ||
        Utils.isEmptyArray(chargingStation.connectors)) {
      result.notSupported = true;
      result.currentAmp = result.maxAmp;
      result.currentWatt = Utils.convertAmpToPowerWatts(chargingStation, result.currentAmp);
      return result;
    }
    // Connector Provided?
    if (connector) {
      // Charging Profile?
      if (forChargingProfile) {
        result.maxAmp = connector.amperageLimit;
      } else {
        result.maxAmp = connector.amperage;
        result.currentAmp = connector.amperageLimit;
      }
    } else {
      result.maxAmp = 0;
      if (!forChargingProfile) {
        result.currentAmp = 0;
      }
      // Add all connector's amps
      for (const chargerConnector of chargingStation.connectors) {
        // Charging Profile?
        if (forChargingProfile) {
          result.maxAmp += chargerConnector.amperageLimit;
        } else {
          result.maxAmp += chargerConnector.amperage;
          result.currentAmp += chargerConnector.amperageLimit;
        }
      }
    }
    // Default
    if (result.currentAmp === 0) {
      result.currentAmp = result.maxAmp;
    }
    result.minWatt = Utils.convertAmpToPowerWatts(chargingStation, result.minAmp);
    result.maxWatt = Utils.convertAmpToPowerWatts(chargingStation, result.maxAmp);
    result.currentWatt = Utils.convertAmpToPowerWatts(chargingStation, result.currentAmp);
    return result;
  }

  public static sortArrayOfKeyValue(element1: KeyValue, element2: KeyValue) {
    if (element1.value < element2.value) {
      return -1;
    }
    if (element1.value > element2.value) {
      return 1;
    }
    return 0;
  }

  public static convertAmpToPowerWatts(charger: ChargingStation, ampValue: number): number {
    if (charger && charger.connectors && charger.connectors.length > 0 && charger.connectors[0].numberOfConnectedPhase !== undefined) {
      return ChargingStations.convertAmpToWatt(charger.connectors[0].numberOfConnectedPhase, ampValue);
    }
    return 0;
  }

  public static convertAmpToPowerString(charger: ChargingStation, appUnitFormatter: AppUnitPipe, ampValue: number, unit: 'W'|'kW' = 'kW', displayUnit: boolean = true, numberOfDecimals?: number): string {
    // TBD use corresponding connector, instead of first connector
    if (charger && charger.connectors && charger.connectors.length > 0 && charger.connectors[0].numberOfConnectedPhase !== undefined) {
      return appUnitFormatter.transform(
        Utils.convertAmpToPowerWatts(charger, ampValue), 'W', unit, displayUnit, 1, numberOfDecimals ? numberOfDecimals : 0);
    }
    return 'N/A';
  }

  public static buildUserFullName(user: User) {
    let fullName: string;
    if (!user || !user.name) {
      return '######';
    }
    if (user.name.length === 0 && user.firstName.length === 0) {
      return '######';
    }
    if (user.firstName) {
      fullName = `${user.name}, ${user.firstName}`;
    } else {
      fullName = user.name;
    }
    return fullName;
  }

  public static getMobileVendor(): MobileType|null {
    const userAgent: string = navigator.userAgent as string || navigator.vendor as string || window['opera'] as string;
    if (userAgent.match(/iPad/i) || userAgent.match(/iPhone/i) || userAgent.match(/iPod/i)) {
      return MobileType.IOS;
    } else if (userAgent.match(/Android/i)) {
      return MobileType.ANDROID;
    }
    return null;
  }

  public static buildMobileAppDeepLink(path: string): string {
    const mobileVendor = Utils.getMobileVendor();
    switch (mobileVendor) {
      case MobileType.IOS:
        return `eMobility://${path}`;
      case MobileType.ANDROID:
        return `intent://${path}#Intent;scheme=eMobility;package=com.emobility;end`;
    }
    return '';
  }

  public static handleHttpError(error: any, router: Router, messageService: MessageService,
    centralServerService: CentralServerService, errorMessage: string, params?: object) {
    // Check error
    switch (error.status) {
      // Server connection error`
      case 0:
        messageService.showErrorMessageConnectionLost();
        if (centralServerService.isAuthenticated()) {
          // Log Off (remove token)
          centralServerService.logoutSucceeded();
        }
        // Login
        router.navigate(['/auth/login']);
        break;

      // Unauthorized!
      case UNAUTHORIZED:
        // Not logged in so redirect to login page with the return url
        router.navigate(['/auth/login']);
        break;
      // Conflict in User Session
      case FORBIDDEN:
        messageService.showWarningMessageUserOrTenantUpdated();
        if (centralServerService.isAuthenticated()) {
          // Log Off (remove token)
          centralServerService.logoutSucceeded();
        }
        router.navigate(['/auth/login']);
        break;
      case BAD_REQUEST:
        messageService.showErrorMessage('general.invalid_content');
        break;

      case CONFLICT:
        if (error.details) {
          messageService.showErrorMessage(error.details.message, error.details.params);
        } else {
          messageService.showErrorMessage(error.message);
        }
        break;

      // Backend issue
      default:
        console.log(`HTTP Error: ${errorMessage}: ${error.message} (${error.status})`);
        messageService.showErrorMessage(errorMessage, params);
        break;
    }
  }

  public static convertToDate(date: any): Date {
    // Check
    if (!date) {
      return date;
    }
    // Check Type
    if (!(date instanceof Date)) {
      return new Date(date);
    }
    return date;
  }

  public static convertToInteger(value: any): number {
    let changedValue = value;
    if (!value) {
      return 0;
    }
    // Check
    if (typeof value === 'string') {
      // Create Object
      changedValue = parseInt(value, 10);
    }
    return changedValue;
  }

  public static convertToFloat(value: any): number {
    let changedValue = value;
    if (!value) {
      return 0;
    }
    // Check
    if (typeof value === 'string') {
      // Create Object
      changedValue = parseFloat(value);
    }
    return changedValue;
  }

  public static isNull(obj: any): boolean {
    // tslint:disable-next-line: triple-equals
    return obj == null;
  }

  public static isValidDate(date: any): boolean {
    return moment(date).isValid();
  }

  public static copyToClipboard(content: any) {
    const element = document.createElement('textarea');
    element.style.position = 'fixed';
    element.style.left = '0';
    element.style.top = '0';
    element.style.opacity = '0';
    element.value = content;
    document.body.appendChild(element);
    element.focus();
    element.select();
    document.execCommand('copy');
    document.body.removeChild(element);
  }
}
