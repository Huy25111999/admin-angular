import {
  HTTP_INTERCEPTORS,
  HttpEvent,
  HttpHeaders,
  HttpErrorResponse,
  HttpClient,
} from '@angular/common/http';
import { Injectable, Injector } from '@angular/core';
import { HttpInterceptor, HttpHandler, HttpRequest } from '@angular/common/http';
// import {} from "./Account.service.";

import { BehaviorSubject, Observable, throwError } from 'rxjs';
import { catchError, switchMap, filter, take, tap } from 'rxjs/operators';
import { Router } from '@angular/router';
import { AuthService } from '../modules/auth/auth.service';
const TOKEN_HEADER_KEY = 'Authorization';

@Injectable({
  providedIn: 'any',
})
export class AuthInterceptor implements HttpInterceptor {
  authreq;
  refresh = false;
  constructor(
    private authService: AuthService,
    private http: HttpClient,
    private injector: Injector,
    private router: Router
  ) {}

  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    const token = this.authService.getToken();
    console.log('token--', token);

    if (token) {
      req = this.addTokenHeaderNoLanguage(req, token);
    }
    // return next.handle(req)

    return next.handle(req).pipe(
      // ----Xử lý refresh token

      catchError((errorData: any) => {
        console.log('errorData', errorData);
        const autherService = this.injector.get(AuthService);

        if (
          errorData.url.includes('token?grant_type=refresh_token') ||
          errorData.url.includes('token?grant_type=password') ||
          errorData.url.includes('/account/info')
        ) {
          if (errorData.url.includes('token?grant_type=refresh_token')) {
            this.authService.reset();
            this.router.navigate([`account/login`]);
            this.authService.checkAuthenticated();
          } else if (errorData.url.includes('token?grant_type=password')) {
            this.authService.reset();
            if (errorData.status == 400) {
              if (errorData.error.code === 410 || errorData.error.code === 411) {
                autherService.isCaptcha.next(true);
                autherService.isHadError.next(false);
              } else {
                // autherService.isCaptcha.next(false);
                autherService.isHadError.next(true);
              }
            }
          } else if (errorData.url.includes('/account/info')) {
            if (errorData.status == 400 || errorData.status == 403 || errorData.status == 404) {
              this.authService.reset();
              autherService.isHadError.next(true);
            } else {
              if (errorData.status !== 401) {
                console.log('lỗi hệ thống');
              }
            }
          }
          return throwError(errorData);
        }

        if (errorData.status === 401) {
          if (this.refreshTokenInProgress) {
            return this.refreshTokenSubject.pipe(
              filter(token => token !== null),
              take(1),
              switchMap(token => next.handle(this.addTokenHeaderNoLanguage(req, token)))
            );
          } else {
            this.refreshTokenInProgress = true;
            // Set the refreshTokenSubject to null so that subsequent API calls will wait until the new token has been retrieved
            this.refreshTokenSubject.next(null);
            this.isCallRefreshToken = true;
            return autherService.refreshToken().pipe(
              tap(token => {
                this.isCallRefreshToken = false;
              }),
              switchMap((newToken: any) => {
                this.refreshTokenInProgress = false;
                this.authService.saveToken(JSON.stringify(newToken));
                this.refreshTokenSubject.next(newToken.access_token);
                return next.handle(this.addTokenHeaderNoLanguage(req, newToken.access_token));
              })
            );
          }
        }
        if (errorData.status == 400) {
          if (errorData.error instanceof Blob) {
          } else {
            console.log('error 400');
          }
        } else if (errorData.status == 500) {
          if (errorData.error instanceof Blob) {
          } else {
            autherService.isHadError.next(false);
            console.log('error server');
          }
        } else {
          console.log('error hệ thống');
        }
        return throwError(errorData);
      })
    );
  }

  // Xử lý refresh token
  private isCallRefreshToken = false;
  private refreshTokenInProgress = false;
  private refreshTokenSubject: BehaviorSubject<any> = new BehaviorSubject<any>(null);

  private addTokenHeader(request: HttpRequest<any>, token: string, language: any) {
    if (request.headers.has('Authorization') && this.isCallRefreshToken) {
      return request.clone({
        setHeaders: {
          'Accept-Language': language,
        },
      });
    }
    return request.clone({
      setHeaders: {
        Authorization: 'Bearer ' + token,
        'Accept-Language': language,
      },
    });
  }

  private addTokenHeaderNoLanguage(request: HttpRequest<any>, token: string) {
    if (request.headers.has('Authorization') && this.isCallRefreshToken) {
      return request.clone({});
    }
    return request.clone({
      setHeaders: {
        Authorization: 'Bearer ' + token,
      },
    });
  }
}
