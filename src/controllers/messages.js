
class MessageContoller{
    constructor(){
        console.log("MessageController created successfully!")
    }
    async post_message(body, DB){
        console.log("Posting started");
        const name = body.Name;
        const message = bosy.Message;
        const result = DB.post_message(name, message);
        console.log("Posting processing");
        if (result === true)
            return [201, "Message posted successfully"];
        else
            return [422, "Wrong message format"];
    }
}

module.exports = MessageContoller;