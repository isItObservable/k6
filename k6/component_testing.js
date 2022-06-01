import grpc from 'k6/net/grpc';
import { sleep,check} from 'k6';

/**
 * Hipster workload generator by k6
 * @param __ENV.FRONTEND_ADDR
 * @constructor yuxiaoba
 */


export let options = {
    vus: 30,
    duration: '5m',
    discardResponseBodies: true,
};



const tasks = {

    "browseProduct": 10,

};

const products = [
    '0PUK6V6EV0',
    '1YMWWN1N4O',
    '2ZYFJ3GM2N',
    '66VCHSJNUP',
    '6E92ZMYYFZ',
    '9SIQT8TOJO',
    'L9ECAV7KIM',
    'LS4PSXUNUM',
    'OLJCESPC7Z'];

const waittime = [1,2,3,4,5,6,7,8,9,10]



const client = new grpc.Client();
client.load(['proto'],'demo.proto');



export default function() {
       //Access browseProduct page
     client.connect('productcatalogservice.hipster-shop.svc:3550', {
        plaintext: true
     });
    for ( let i=0; i<tasks["browseProduct"]; i++)
    {
        const dat = {  };
        const res = client.invoke('hipstershop.ProductCatalogService/ListProducts',dat);
        check(res, {
            'status is OK': (r) => r && r.status === grpc.StatusOK,
          });
          console.log(JSON.stringify(res.message));

        let product = products[Math.floor(Math.random() * products.length)]
        console.log("product selected "+ product)
        const data = { id: product };
        const response = client.invoke('hipstershop.ProductCatalogService/GetProduct', data);

         check(response, {
            'status is OK': (r) => r && r.status === grpc.StatusOK,
          });

        console.log(JSON.stringify(response.message));

        client.close();
        sleep(waittime[Math.floor(Math.random() * waittime.length)])
    }


}