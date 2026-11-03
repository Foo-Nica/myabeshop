import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { setupApp } from '../src/setup-app';
import { MessagingService } from '../src/notifications/messaging.service';

export async function createTestApp() {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication({ rawBody: true });
  setupApp(app);
  await app.init();
  return { app, messaging: app.get(MessagingService) };
}

let phoneSeq = 10_000_000 + Math.floor(Math.random() * 80_000_000);
/** A fresh valid Ivorian mobile number for each call. */
export function nextPhone() {
  phoneSeq += 1 + Math.floor(Math.random() * 50);
  return `07${String(phoneSeq).slice(-8)}`;
}

/** Signs in with phone + OTP, exactly like the mobile sign-up screen (parcours A, étape 1). */
export async function signInWithPhone(app: INestApplication, phone: string, name = 'Testeur') {
  const http = request(app.getHttpServer());
  const req = await http.post('/auth/otp/request').send({ target: phone, country: 'CI' }).expect(200);
  const res = await http.post('/auth/otp/verify').send({ target: phone, country: 'CI', code: req.body.devCode, name }).expect(200);
  return res.body as { accessToken: string; refreshToken: string; user: { id: string; name: string } };
}

export function api(app: INestApplication, token?: string) {
  const http = request(app.getHttpServer());
  const auth = (r: request.Test) => (token ? r.set('Authorization', `Bearer ${token}`) : r);
  return {
    get: (url: string) => auth(http.get(url)),
    post: (url: string, body?: object) => auth(http.post(url)).send(body ?? {}),
    patch: (url: string, body?: object) => auth(http.patch(url)).send(body ?? {}),
    delete: (url: string) => auth(http.delete(url)),
  };
}

/** Creates a store with two zones and a published product; returns everything a test needs. */
export async function setupStore(app: INestApplication, name: string) {
  const owner = await signInWithPhone(app, nextPhone(), `Propriétaire ${name}`);
  const a = api(app, owner.accessToken);
  const store = (await a.post('/stores', { name, country: 'CI', category: 'beauty' }).expect(201)).body;
  const zones = (
    await a
      .post(`/stores/${store.id}/zones/bulk`, {
        zones: [
          { name: 'Cocody', city: 'Abidjan', fee: 1000, freeAbove: 30000 },
          { name: 'Bouaké', city: 'Bouaké', fee: 3000 },
        ],
      })
      .expect(201)
  ).body;
  const product = (
    await a
      .post(`/stores/${store.id}/products`, {
        title: 'Crème éclaircissante',
        price: 10000,
        compareAtPrice: 15000,
        status: 'PUBLISHED',
        quantityOffers: [{ quantity: 2, price: 18000 }],
      })
      .expect(201)
  ).body;
  return { owner, a, store, zones, product };
}
