import { Client, ClientProxy, Transport } from "@nestjs/microservices";
import { Injectable } from "@nestjs/common";
import { ObjectID } from "typeorm";
import { UserDTO, ProductDTO } from "@commerce/shared";
import { redis, redisProductsKey } from "../utils/redis";
import { config } from "../config";

@Injectable()
export class ProductService {
  @Client({
    transport: Transport.TCP,
    options: {
      host: config.USERS_HOST,
      port: parseInt(config.USERS_PORT as string)
    }
  })
  private userClient: ClientProxy;
  @Client({
    transport: Transport.TCP,
    options: {
      host: config.PRODUCTS_HOST,
      port: parseInt(config.PRODUCTS_PORT as string)
    }
  })
  private productClient: ClientProxy;

  async get(): Promise<ProductDTO[]> {
    return new Promise((resolve, reject) => {
      // get products through cache.
      redis.get(redisProductsKey, (err, products) => {
        // if products don't persist, retrieve them, and store in redis.
        if (!products) {
          this.productClient.send<ProductDTO[]>("products", []).subscribe(
            products => {
              // get users by ids in products.
              const userIds = products.map(product => product.user_id);
              this.userClient
                .send<UserDTO[]>("fetch-users-by-ids", userIds)
                .subscribe(
                  users => {
                    // map users to their products.
                    const mappedProducts = products.map(product => {
                      product = {
                        ...product,
                        user: users.find(user => user.id === product.user_id)
                      };
                      delete product.user_id;
                      return product;
                    });
                    redis.set(redisProductsKey, JSON.stringify(mappedProducts));
                    resolve(mappedProducts);
                  },
                  error => reject(error)
                );
            },
            error => reject(error)
          );
        }
        // return the parsed products from cache.
        resolve(JSON.parse(products));
      });
    });
  }
}
